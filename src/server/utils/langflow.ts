/**
 * Client Langflow pour les appels API
 */

import { env } from "~/env";

const LANGFLOW_API_URL =
  env.LANGFLOW_API_URL ?? "https://langflow.srv1097345.hstgr.cloud";
const LANGFLOW_API_KEY = env.LANGFLOW_API_KEY;

if (!LANGFLOW_API_KEY) {
  console.warn(
    "⚠️ LANGFLOW_API_KEY n'est pas définie dans les variables d'environnement",
  );
}

export interface LangflowRunRequest {
  output_type: "chat" | "json";
  input_type: "chat" | "json";
  input_value: string; // Toujours string (JSON stringifié si nécessaire)
  tweaks?: Record<string, Record<string, unknown>>;
  session_id?: string;
  stream?: boolean;
  [key: string]: unknown; // Permet d'ajouter des champs personnalisés selon le workflow
}

export interface LangflowRunResponse {
  outputs?: Array<{
    outputs?: Array<{
      results?: {
        message?: {
          text?: string;
        };
      };
    }>;
  }>;
  error?: string;
}

export interface LangflowStreamEvent {
  event: "add_message" | "token" | "end" | "error";
  data: {
    chunk?: string;
    text?: string;
    id?: string;
    timestamp?: string;
    sender?: string;
    sender_name?: string;
    content_blocks?: Array<{
      title?: string;
      contents?: unknown[];
    }>;
    [key: string]: unknown;
  };
}

/**
 * Exécuter un workflow Langflow
 */
export async function runLangflowWorkflow(
  workflowId: string,
  request: LangflowRunRequest,
  onUpdate?: StreamingCallback,
): Promise<LangflowRunResponse> {
  if (!LANGFLOW_API_KEY) {
    throw new Error("LANGFLOW_API_KEY n'est pas configurée");
  }

  const url = `${LANGFLOW_API_URL}/api/v1/run/${workflowId}?stream=${request.stream ?? false}`;

  // Logger la requête complète
  console.log("🚀 [Langflow] Requête API:");
  console.log("📍 URL:", url);
  console.log("📦 Body:", JSON.stringify(request, null, 2));

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": LANGFLOW_API_KEY,
    },
    body: JSON.stringify(request),
  });

  console.log("📥 [Langflow] Status:", response.status, response.statusText);

  if (!response.ok) {
    const errorText = await response.text();
    console.error("❌ [Langflow] Erreur:", response.status, errorText);
    throw new Error(`Erreur Langflow (${response.status}): ${errorText}`);
  }

  // Si streaming, parser les événements SSE
  if (request.stream) {
    return await parseStreamingResponse(response, onUpdate);
  }

  // Sinon, parser la réponse JSON classique
  const responseText = await response.text();
  console.log(
    "✅ [Langflow] Réponse reçue (premiers 500 caractères):",
    responseText.substring(0, 500),
  );

  try {
    const data: unknown = JSON.parse(responseText);
    console.log("✅ [Langflow] Réponse parsée avec succès");
    return data as LangflowRunResponse;
  } catch (parseError) {
    console.error("❌ [Langflow] Erreur de parsing JSON:");
    console.error(
      "   Erreur:",
      parseError instanceof SyntaxError ? parseError.message : "inconnue",
    );
    console.error("   Réponse complète:", responseText);
    throw parseError;
  }
}

/**
 * Callback pour envoyer des mises à jour via SSE
 */
export type StreamingCallback = (update: {
  type: "token" | "reasoning" | "tool" | "message" | "error" | "end";
  data: unknown;
}) => void;

/**
 * Parser la réponse streaming (SSE) de Langflow
 */
async function parseStreamingResponse(
  response: Response,
  onUpdate?: StreamingCallback,
): Promise<LangflowRunResponse> {
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";
  let finalMessage: string | undefined;
  const reasoning: Array<{
    type: string;
    content: string;
    timestamp?: string;
  }> = [];
  // Set pour dédupliquer les raisonnements par ID de message
  const processedMessageIds = new Set<string>();
  // Map pour stocker les raisonnements par ID de message (on garde le plus complet)
  const reasoningByMessageId = new Map<
    string,
    Array<{ type: string; content: string; timestamp?: string }>
  >();

  if (!reader) {
    throw new Error("Impossible de lire le stream");
  }

  console.log("📡 [Langflow] Début du parsing du stream...");
  const startTime = Date.now();
  let eventCount = 0;
  let tokenCount = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        const duration = Date.now() - startTime;
        console.log(
          `✅ [Langflow] Stream terminé (${duration}ms, ${eventCount} événements, ${tokenCount} tokens)`,
        );
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      // Logger le buffer brut pour debug (seulement les premiers chunks)
      if (eventCount === 0 && buffer.length > 0 && buffer.length < 2000) {
        console.log(
          `🔍 [Langflow] Buffer brut (${buffer.length} chars):`,
          buffer.substring(0, 500),
        );
      }

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? ""; // Garder la ligne incomplète dans le buffer

      for (const line of lines) {
        if (!line.trim()) continue;

        let jsonStr = "";
        // Parser les lignes JSON (format SSE: data: {...} ou JSON brut)
        if (line.startsWith("data: ")) {
          jsonStr = line.slice(6).trim(); // Enlever "data: "
        } else if (line.trim().startsWith("{")) {
          // Format JSON brut (sans préfixe "data: ")
          jsonStr = line.trim();
        } else {
          // Ligne non-JSON, logger pour debug seulement si c'est suspect
          if (line.length > 10 && !line.startsWith(":")) {
            console.log(
              `⚠️ [Langflow] Ligne ignorée (${line.length} chars):`,
              line.substring(0, 100),
            );
          }
          continue;
        }

        try {
          const parsed = JSON.parse(jsonStr) as unknown;
          const event = parsed as LangflowStreamEvent;
          eventCount++;

          // Logger chaque événement avec plus de détails
          const timestamp = new Date().toISOString();
          console.log(
            `\n📨 [Langflow] [${timestamp}] Événement #${eventCount}: ${event.event}`,
          );

          if (event.data.id) {
            console.log(`   └─ ID: ${event.data.id}`);
          }
          if (event.data.timestamp) {
            console.log(`   └─ Timestamp: ${event.data.timestamp}`);
          }

          if (event.event === "token" && event.data.chunk) {
            // Token de texte en streaming
            fullText += event.data.chunk;
            tokenCount++;
            // Envoyer le token via callback SSE
            onUpdate?.({
              type: "token",
              data: { chunk: event.data.chunk, fullText },
            });
            // Logger seulement tous les 10 tokens pour éviter trop de logs
            if (tokenCount % 10 === 0 || event.data.chunk.includes("\n")) {
              console.log(
                `💬 [Langflow] Token #${tokenCount}: "${event.data.chunk.replace(/\n/g, "\\n")}" (total: ${fullText.length} chars)`,
              );
            }
          } else if (event.event === "add_message") {
            const messageId = event.data.id ?? `unknown-${eventCount}`;
            const sender = event.data.sender ?? "";
            const senderName = event.data.sender_name ?? "";
            const isNewMessage = !processedMessageIds.has(messageId);

            // IGNORER les messages avec sender: "User" - c'est juste un écho du message utilisateur
            if (sender === "User" || senderName === "User") {
              console.log(
                `   └─ [IGNORÉ] Écho du message utilisateur (sender: ${sender})`,
              );
              continue;
            }

            // Logger seulement pour les nouveaux messages ou les messages complets
            if (
              event.data.properties &&
              typeof event.data.properties === "object"
            ) {
              const props = event.data.properties as Record<string, unknown>;
              const state =
                typeof props.state === "string" ? props.state : "unknown";

              // Logger seulement si nouveau message ou si état est "complete" ou "partial"
              if (isNewMessage || state === "complete" || state === "partial") {
                console.log(
                  `   └─ Sender: ${sender} (${senderName})`,
                );
                console.log(`   └─ State: ${state}`);
              }

              // Extraire le raisonnement pour les messages "partial" (raisonnement en cours)
              // et "complete" (raisonnement final)
              if (
                (state === "partial" || state === "complete") &&
                event.data.content_blocks &&
                Array.isArray(event.data.content_blocks)
              ) {
                // Pour les messages "partial", on traite toujours pour avoir le raisonnement en temps réel
                // Pour les messages "complete", on ne traite qu'une seule fois par message ID
                const shouldProcessReasoning = 
                  state === "partial" || 
                  (state === "complete" && !reasoningByMessageId.has(messageId));

                if (shouldProcessReasoning) {
                  const messageReasoning: Array<{
                    type: string;
                    content: string;
                    timestamp?: string;
                  }> = [];

                  console.log(
                    `   └─ Content blocks: ${event.data.content_blocks.length} (state: ${state})`,
                  );
                  for (const block of event.data.content_blocks) {
                    if (
                      block.title === "Agent Steps" &&
                      Array.isArray(block.contents)
                    ) {
                      console.log(
                        `   └─ Agent Steps: ${block.contents.length} étapes`,
                      );
                      for (let i = 0; i < block.contents.length; i++) {
                        const content = block.contents[i];
                        if (typeof content === "object" && content !== null) {
                          const contentObj = content as Record<string, unknown>;
                          if (contentObj.type === "tool_use") {
                            const toolName =
                              typeof contentObj.name === "string"
                                ? contentObj.name
                                : "";
                            const toolInput = (contentObj.tool_input ??
                              {}) as Record<string, unknown>;
                            const toolOutput = contentObj.output;
                            const duration =
                              typeof contentObj.duration === "number"
                                ? contentObj.duration
                                : undefined;

                            const toolStep = {
                              type: "tool_use",
                              content: `🔧 Exécution: ${toolName}\n   Input: ${JSON.stringify(toolInput, null, 2)}\n   Output: ${JSON.stringify(toolOutput, null, 2)}`,
                              timestamp:
                                typeof event.data.timestamp === "string"
                                  ? event.data.timestamp
                                  : undefined,
                            };
                            messageReasoning.push(toolStep);
                            
                            // Envoyer l'utilisation d'outil via callback SSE
                            onUpdate?.({
                              type: "tool",
                              data: {
                                name: toolName,
                                input: toolInput,
                                output: toolOutput,
                                duration,
                              },
                            });

                            console.log(
                              `🔧 [Langflow] [Étape ${i + 1}] Tool utilisé: ${toolName}${duration ? ` (${duration}ms)` : ""}`,
                            );
                            if (Object.keys(toolInput).length > 0) {
                              console.log(
                                `   └─ Input: ${JSON.stringify(toolInput, null, 2).substring(0, 200)}`,
                              );
                            }
                          } else if (contentObj.type === "text") {
                            const text =
                              typeof contentObj.text === "string"
                                ? contentObj.text
                                : "";
                            if (text) {
                              const reasoningStep = {
                                type: "reasoning",
                                content: text,
                                timestamp:
                                  typeof event.data.timestamp === "string"
                                    ? event.data.timestamp
                                    : undefined,
                              };
                              messageReasoning.push(reasoningStep);
                              
                              // Envoyer le raisonnement via callback SSE
                              onUpdate?.({
                                type: "reasoning",
                                data: { content: text },
                              });
                              console.log(
                                `💭 [Langflow] [Étape ${i + 1}] Raisonnement (${text.length} chars):`,
                                text.substring(0, 200) +
                                  (text.length > 200 ? "..." : ""),
                              );
                            }
                          } else {
                            const contentType =
                              typeof contentObj.type === "string"
                                ? contentObj.type
                                : "unknown";
                            console.log(
                              `   └─ [Étape ${i + 1}] Type: ${contentType}`,
                            );
                          }
                        }
                      }
                    } else {
                      console.log(
                        `   └─ Block: ${String(block.title ?? "unknown")} (${Array.isArray(block.contents) ? block.contents.length : 0} items)`,
                      );
                    }
                  }

                  // Ajouter le raisonnement au tableau global
                  if (messageReasoning.length > 0) {
                    if (state === "complete") {
                      // Pour les messages complets, remplacer le raisonnement précédent
                      reasoningByMessageId.set(messageId, messageReasoning);
                      // Remplacer les anciens raisonnements de ce message ID
                      const existingIndex = reasoning.findIndex(
                        (r) => r.timestamp === messageId,
                      );
                      if (existingIndex >= 0) {
                        reasoning.splice(existingIndex, 1);
                      }
                      reasoning.push(...messageReasoning);
                      processedMessageIds.add(messageId);
                    } else if (state === "partial") {
                      // Pour les messages partiels, on ajoute directement pour afficher en temps réel
                      // On marque avec le messageId comme timestamp pour pouvoir les remplacer plus tard
                      const partialReasoning = messageReasoning.map((r) => ({
                        ...r,
                        timestamp: messageId, // Utiliser messageId comme identifiant
                      }));
                      reasoning.push(...partialReasoning);
                      console.log(
                        `💭 [Langflow] Raisonnement partiel ajouté (${messageReasoning.length} étapes)`,
                      );
                    }
                  }
                }
              }
            }

            if (event.data.text) {
              finalMessage = event.data.text;
              // Envoyer le message via callback SSE
              const isComplete =
                event.data.properties &&
                typeof event.data.properties === "object" &&
                (event.data.properties as Record<string, unknown>).state ===
                  "complete";
              if (isComplete) {
                onUpdate?.({
                  type: "message",
                  data: { text: event.data.text, complete: true },
                });
              }
              // Logger le message seulement si nouveau ou complet
              if (
                isNewMessage ||
                isComplete
              ) {
                console.log(
                  `💬 [Langflow] Message complet (${event.data.text.length} chars):`,
                  event.data.text.substring(0, 150) +
                    (event.data.text.length > 150 ? "..." : ""),
                );
              }
            }
          } else if (event.event === "end") {
            // Événement final avec le résultat complet
            console.log("\n🏁 [Langflow] Événement 'end' reçu");
            onUpdate?.({
              type: "end",
              data: { finalMessage },
            });
            if (event.data.result && typeof event.data.result === "object") {
              const endResult = event.data.result as Record<string, unknown>;
              console.log(
                `   └─ Résultat disponible: ${endResult.outputs ? "oui" : "non"}`,
              );
              if (endResult.outputs && Array.isArray(endResult.outputs)) {
                const outputs = endResult.outputs;
                if (outputs[0] && typeof outputs[0] === "object") {
                  const firstOutput = outputs[0] as Record<string, unknown>;
                  if (
                    firstOutput.outputs &&
                    Array.isArray(firstOutput.outputs)
                  ) {
                    const innerOutputs = firstOutput.outputs[0] as unknown;
                    if (innerOutputs && typeof innerOutputs === "object") {
                      const inner = innerOutputs as Record<string, unknown>;
                      if (inner.results && typeof inner.results === "object") {
                        const results = inner.results as Record<
                          string,
                          unknown
                        >;
                        if (
                          results.message &&
                          typeof results.message === "object"
                        ) {
                          const message = results.message as Record<
                            string,
                            unknown
                          >;
                          if (typeof message.text === "string") {
                            finalMessage = message.text;
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          } else if (event.event === "error") {
            console.error("\n❌ [Langflow] Erreur dans le stream:");
            console.error("   └─ Data:", JSON.stringify(event.data, null, 2));
            onUpdate?.({
              type: "error",
              data: event.data,
            });
          } else {
            console.log(
              `   └─ Données: ${JSON.stringify(event.data).substring(0, 200)}`,
            );
          }
        } catch (parseError) {
          console.error("❌ [Langflow] Erreur parsing événement:");
          console.error(
            "   Erreur:",
            parseError instanceof Error
              ? parseError.message
              : String(parseError),
          );
          console.error(
            `   Ligne brute (${line.length} chars):`,
            line.substring(0, 200),
          );
          console.error(
            `   JSON tenté (${jsonStr.length} chars):`,
            jsonStr.substring(0, 200),
          );
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  // Construire la réponse finale
  const responseData: LangflowRunResponse = {
    outputs: [
      {
        outputs: [
          {
            results: {
              message: {
                text: finalMessage ?? fullText,
              },
            },
          },
        ],
      },
    ],
  };

  // Logger le raisonnement complet (dédupliqué)
  if (reasoning.length > 0) {
    console.log("\n🧠 [Langflow] Raisonnement complet (dédupliqué):");
    let stepNumber = 1;
    for (const step of reasoning) {
      if (step.type === "reasoning") {
        console.log(`\n💭 [Étape ${stepNumber}] Raisonnement:`);
        console.log(step.content);
        stepNumber++;
      } else if (step.type === "tool_use") {
        console.log(`\n🔧 [Étape ${stepNumber}] ${step.content}`);
        stepNumber++;
      }
    }
  }

  return responseData;
}

/**
 * Extraire le message de la réponse Langflow
 */
export function extractMessageFromResponse(
  response: LangflowRunResponse,
): string {
  try {
    const message = response.outputs?.[0]?.outputs?.[0]?.results?.message?.text;

    if (message) {
      return message;
    }

    // Fallback : chercher dans toute la structure
    const jsonStr = JSON.stringify(response);
    const regex = /"text"\s*:\s*"([^"]+)"/;
    const messageMatch = regex.exec(jsonStr);
    if (messageMatch) {
      return messageMatch[1] ?? "";
    }

    return "Désolé, je n'ai pas pu générer de réponse.";
  } catch (error) {
    console.error("Erreur lors de l'extraction du message:", error);
    return "Erreur lors de la génération de la réponse.";
  }
}
