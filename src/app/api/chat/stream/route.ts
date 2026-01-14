import { type NextRequest } from "next/server";
import { auth } from "~/server/better-auth";
import { db } from "~/server/db";
import {
  runLangflowWorkflow,
  extractMessageFromResponse,
} from "~/server/utils/langflow";
import type { StreamingCallback } from "~/server/utils/langflow";

export async function GET(req: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: req.headers,
    });
    if (!session?.user?.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");
    const message = searchParams.get("message");

    if (!sessionId || !message) {
      return new Response("Missing sessionId or message", { status: 400 });
    }

    // Récupérer la session
    const chatSession = await db.chatSession.findFirst({
      where: {
        id: sessionId,
        userId: session.user.id,
      },
      include: {
        organization: true,
      },
    });

    if (!chatSession) {
      return new Response("Session not found", { status: 404 });
    }

    // Récupérer le workflow
    const workflow = await db.langflowWorkflow.findFirst({
      where: {
        workflowId: chatSession.workflowId ?? "",
        isActive: true,
        OR: [
          { allOrganizations: true },
          {
            organizations: {
              some: {
                organizationId: chatSession.organizationId,
              },
            },
          },
        ],
      },
    });

    if (!workflow) {
      return new Response("Workflow not found", { status: 404 });
    }

    // Préparer la configuration du workflow (tweaks uniquement)
    const config = workflow.config
      ? (JSON.parse(workflow.config) as Record<string, unknown>)
      : {};

    const workflowTweaks =
      (config.tweaks as Record<string, Record<string, unknown>> | undefined) ??
      {};

    // Fonction pour remplacer les variables dynamiques
    const replaceVariables = (value: unknown): unknown => {
      if (typeof value === "string") {
        return value
          .replace(/\{\{organizationId\}\}/g, chatSession.organizationId)
          .replace(/\{\{userId\}\}/g, session.user.id)
          .replace(/\{\{sessionId\}\}/g, chatSession.id);
      }
      if (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
      ) {
        const obj = value as Record<string, unknown>;
        const result: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(obj)) {
          result[key] = replaceVariables(val);
        }
        return result;
      }
      if (Array.isArray(value)) {
        return value.map((item) => replaceVariables(item));
      }
      return value;
    };

    const tweaks: Record<string, Record<string, unknown>> = {};
    for (const [componentId, componentConfig] of Object.entries(
      workflowTweaks,
    )) {
      tweaks[componentId] = replaceVariables(componentConfig) as Record<
        string,
        unknown
      >;
    }

    // Créer un ReadableStream pour SSE
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        const sendSSE = (data: unknown, event?: string) => {
          const eventLine = event ? `event: ${event}\n` : "";
          const dataLine = `data: ${JSON.stringify(data)}\n\n`;
          try {
            controller.enqueue(encoder.encode(eventLine + dataLine));
          } catch (error) {
            console.error("Erreur lors de l'envoi SSE:", error);
          }
        };

        const onUpdate: StreamingCallback = (update) => {
          sendSSE(update.data, update.type);
        };

        try {
          const requestBody = {
            output_type: "chat" as const,
            input_type: "chat" as const,
            input_value: message,
            tweaks,
            session_id: chatSession.id,
            stream: true,
          };

          // Lancer le workflow avec streaming
          void runLangflowWorkflow(workflow.workflowId, requestBody, onUpdate)
            .then(async (langflowResponse) => {
              const assistantResponse =
                extractMessageFromResponse(langflowResponse);

              // Récupérer la session à jour pour avoir tous les messages (y compris le message utilisateur)
              const updatedSession = await db.chatSession.findFirst({
                where: { id: chatSession.id },
              });

              if (!updatedSession) {
                console.error("Session non trouvée lors de la mise à jour");
                controller.close();
                return;
              }

              // Mettre à jour la session en DB avec tous les messages existants + la réponse
              const messages = JSON.parse(
                updatedSession.messages || "[]",
              ) as Array<{
                role: "user" | "assistant";
                content: string;
                timestamp: string;
              }>;

              // Vérifier si le message assistant n'existe pas déjà
              const hasAssistantMessage = messages.some(
                (m) =>
                  m.role === "assistant" && m.content === assistantResponse,
              );

              if (!hasAssistantMessage) {
                messages.push({
                  role: "assistant",
                  content: assistantResponse,
                  timestamp: new Date().toISOString(),
                });
              }

              let title = updatedSession.title;
              if (!title || title === "Nouvelle conversation") {
                title = message.slice(0, 50).trim();
                if (message.length > 50) {
                  title += "...";
                }
              }

              await db.chatSession.update({
                where: { id: chatSession.id },
                data: {
                  messages: JSON.stringify(messages),
                  title,
                  updatedAt: new Date(),
                },
              });

              // Envoyer le message final avec le texte complet
              sendSSE({ text: assistantResponse, complete: true }, "message");
              // Attendre un peu avant de fermer pour s'assurer que le message est envoyé
              setTimeout(() => {
                try {
                  controller.close();
                } catch {
                  // Ignorer les erreurs de fermeture
                }
              }, 200);
            })
            .catch((error) => {
              console.error("Erreur lors de l'appel Langflow:", error);
              sendSSE(
                { error: "Erreur lors de la génération de la réponse" },
                "error",
              );
              controller.close();
            });
        } catch (error) {
          console.error("Erreur dans le stream:", error);
          sendSSE(
            {
              error: error instanceof Error ? error.message : "Erreur inconnue",
            },
            "error",
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Erreur dans l'endpoint SSE:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Erreur inconnue",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
