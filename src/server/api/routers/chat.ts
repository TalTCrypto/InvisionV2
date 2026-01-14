import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
// import { getComposioClient } from "~/server/utils/composio"; // Non utilisé pour l'instant
import { type db } from "~/server/db";

/**
 * Helper pour récupérer l'organisation active avec fallback
 */
async function getActiveOrganizationId(
  dbInstance: typeof db,
  userId: string,
): Promise<string | null> {
  // Récupérer la session
  const session = await dbInstance.session.findFirst({
    where: {
      userId,
      expiresAt: {
        gt: new Date(),
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  // Si une organisation active est définie, l'utiliser
  if (session?.activeOrganizationId) {
    return session.activeOrganizationId;
  }

  // Sinon, prendre la première organisation de l'utilisateur
  const firstMember = await dbInstance.member.findFirst({
    where: { userId },
    orderBy: {
      createdAt: "desc",
    },
  });

  return firstMember?.organizationId ?? null;
}

/**
 * Router pour le Chat IA avec Langflow
 */
export const chatRouter = createTRPCRouter({
  /**
   * Récupérer les workflows Langflow disponibles pour l'organisation active
   */
  getWorkflows: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    // Récupérer l'organisation active avec fallback
    const activeOrganizationId = await getActiveOrganizationId(ctx.db, userId);

    if (!activeOrganizationId) {
      // Aucune organisation trouvée, retourner un tableau vide
      return [];
    }

    // Récupérer le rôle de l'utilisateur dans l'organisation
    const membership = await ctx.db.member.findFirst({
      where: {
        userId,
        organizationId: activeOrganizationId,
      },
      select: {
        role: true,
      },
    });

    const userRole = membership?.role ?? "member";

    // Récupérer tous les workflows actifs accessibles à cette organisation
    const allWorkflows = await ctx.db.langflowWorkflow.findMany({
      where: {
        isActive: true,
        OR: [
          { allOrganizations: true }, // Workflows accessibles à toutes les organisations
          {
            organizations: {
              some: {
                organizationId: activeOrganizationId,
              },
            },
          },
        ],
      },
      include: {
        organizations: {
          where: {
            organizationId: activeOrganizationId,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Filtrer selon les restrictions
    const workflows = allWorkflows.filter((wf) => {
      try {
        // Récupérer les restrictions spécifiques à cette organisation (si existent)
        const orgRestriction = wf.organizations[0];

        let effectiveAllowedRoles = null;
        let effectiveAllowedUserIds = null;

        // Parser les rôles autorisés en toute sécurité
        try {
          effectiveAllowedRoles = orgRestriction?.allowedRoles
            ? (JSON.parse(orgRestriction.allowedRoles) as string[])
            : wf.allowedRoles
              ? (JSON.parse(wf.allowedRoles) as string[])
              : null;
        } catch {
          effectiveAllowedRoles = null;
        }

        // Parser les IDs utilisateurs autorisés en toute sécurité
        try {
          effectiveAllowedUserIds = orgRestriction?.allowedUserIds
            ? (JSON.parse(orgRestriction.allowedUserIds) as string[])
            : wf.allowedUserIds
              ? (JSON.parse(wf.allowedUserIds) as string[])
              : null;
        } catch {
          effectiveAllowedUserIds = null;
        }

        // Si aucune restriction, accessible à tous
        if (!effectiveAllowedRoles && !effectiveAllowedUserIds) {
          return true;
        }

        // Vérifier les rôles autorisés (support des rôles custom)
        if (effectiveAllowedRoles) {
          if (effectiveAllowedRoles.includes(userRole)) {
            return true;
          }
        }

        // Vérifier les utilisateurs autorisés
        if (effectiveAllowedUserIds) {
          if (effectiveAllowedUserIds.includes(userId)) {
            return true;
          }
        }

        return false;
      } catch (error) {
        // En cas d'erreur, ne pas inclure le workflow
        console.error("Erreur lors du filtrage du workflow:", error);
        return false;
      }
    });

    return workflows.map((wf) => {
      let config: Record<string, unknown> | null = null;
      try {
        config = wf.config
          ? (JSON.parse(wf.config) as Record<string, unknown>)
          : null;
      } catch {
        config = null;
      }

      let requiredIntegrations: string[] | null = null;
      try {
        requiredIntegrations = wf.requiredIntegrations
          ? (JSON.parse(wf.requiredIntegrations) as string[])
          : null;
      } catch {
        requiredIntegrations = null;
      }

      return {
        id: wf.id,
        name: wf.name,
        description: wf.description,
        workflowId: wf.workflowId,
        category: wf.category,
        config,
        requiredIntegrations,
      };
    });
  }),

  /**
   * Récupérer les sessions de chat de l'utilisateur pour l'organisation active
   */
  getSessions: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    // Récupérer l'organisation active avec fallback
    const activeOrganizationId = await getActiveOrganizationId(ctx.db, userId);

    if (!activeOrganizationId) {
      return [];
    }

    const chatSessions = await ctx.db.chatSession.findMany({
      where: {
        userId,
        organizationId: activeOrganizationId,
      },
      orderBy: {
        updatedAt: "desc",
      },
      take: 50, // Limiter à 50 dernières sessions
    });

    return chatSessions.map((s) => ({
      id: s.id,
      title: s.title,
      workflowId: s.workflowId,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      messageCount: (JSON.parse(s.messages ?? "[]") as unknown[]).length,
    }));
  }),

  /**
   * Récupérer une session de chat spécifique avec ses messages
   */
  getSession: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const session = await ctx.db.chatSession.findFirst({
        where: {
          id: input.sessionId,
          userId,
        },
      });

      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Session non trouvée",
        });
      }

      const messages = JSON.parse(session.messages || "[]") as Array<{
        role: "user" | "assistant";
        content: string;
        timestamp: string;
      }>;

      return {
        id: session.id,
        title: session.title,
        workflowId: session.workflowId,
        messages,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      };
    }),

  /**
   * Créer une nouvelle session de chat
   */
  createSession: protectedProcedure
    .input(
      z.object({
        workflowId: z.string().optional(),
        title: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Récupérer l'organisation active avec fallback
      const activeOrganizationId = await getActiveOrganizationId(
        ctx.db,
        userId,
      );

      if (!activeOrganizationId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message:
            "Aucune organisation trouvée. Veuillez créer ou rejoindre une organisation.",
        });
      }

      // Si un workflowId est fourni, vérifier qu'il existe et est accessible
      let workflow = null;
      if (input.workflowId) {
        workflow = await ctx.db.langflowWorkflow.findFirst({
          where: {
            id: input.workflowId,
            isActive: true,
            OR: [
              { allOrganizations: true },
              {
                organizations: {
                  some: {
                    organizationId: activeOrganizationId,
                  },
                },
              },
            ],
          },
        });

        if (!workflow) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Workflow non trouvé ou non accessible",
          });
        }
      } else {
        // Utiliser le workflow orchestrateur par défaut
        workflow = await ctx.db.langflowWorkflow.findFirst({
          where: {
            category: "orchestrator",
            isActive: true,
            OR: [
              { allOrganizations: true },
              {
                organizations: {
                  some: {
                    organizationId: activeOrganizationId,
                  },
                },
              },
            ],
          },
        });

        if (!workflow) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message:
              "Aucun workflow orchestrateur trouvé pour cette organisation",
          });
        }
      }

      const chatSession = await ctx.db.chatSession.create({
        data: {
          userId,
          organizationId: activeOrganizationId,
          workflowId: workflow.workflowId, // Utiliser l'ID du workflow Langflow, pas l'ID de la table
          title: input.title ?? "Nouvelle conversation",
          messages: "[]",
        },
      });

      return {
        id: chatSession.id,
        title: chatSession.title,
        workflowId: chatSession.workflowId,
      };
    }),

  /**
   * Mettre à jour le workflow d'une session existante
   */
  updateSession: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
        workflowId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Vérifier que la session existe et appartient à l'utilisateur
      const chatSession = await ctx.db.chatSession.findFirst({
        where: {
          id: input.sessionId,
          userId,
        },
      });

      if (!chatSession) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Session non trouvée",
        });
      }

      // Vérifier que la session est vide
      const messages = JSON.parse(
        chatSession.messages || "[]",
      ) as Array<unknown>;
      if (messages.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Impossible de changer le workflow d'une session qui contient déjà des messages",
        });
      }

      // Récupérer l'organisation active avec fallback
      const activeOrganizationId = await getActiveOrganizationId(
        ctx.db,
        userId,
      );

      if (!activeOrganizationId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Aucune organisation trouvée",
        });
      }

      // Vérifier que le workflow existe et est accessible
      const workflow = await ctx.db.langflowWorkflow.findFirst({
        where: {
          id: input.workflowId,
          isActive: true,
          OR: [
            { allOrganizations: true },
            {
              organizations: {
                some: {
                  organizationId: activeOrganizationId,
                },
              },
            },
          ],
        },
      });

      if (!workflow) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Workflow non trouvé ou non accessible",
        });
      }

      // Mettre à jour la session
      const updatedSession = await ctx.db.chatSession.update({
        where: {
          id: input.sessionId,
        },
        data: {
          workflowId: workflow.workflowId,
        },
      });

      return {
        id: updatedSession.id,
        title: updatedSession.title,
        workflowId: updatedSession.workflowId,
      };
    }),

  /**
   * Envoyer un message dans une session de chat
   */
  sendMessage: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
        message: z.string().min(1, "Le message ne peut pas être vide"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Récupérer la session
      const chatSession = await ctx.db.chatSession.findFirst({
        where: {
          id: input.sessionId,
          userId,
        },
        include: {
          organization: true,
        },
      });

      if (!chatSession) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Session non trouvée",
        });
      }

      // Récupérer le workflow LangflowWorkflow à partir du workflowId stocké dans la session
      const workflow = await ctx.db.langflowWorkflow.findFirst({
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
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Workflow non trouvé",
        });
      }

      // Vérifier les intégrations requises
      let requiredIntegrations: string[] = [];
      if (workflow.requiredIntegrations) {
        try {
          requiredIntegrations = JSON.parse(
            workflow.requiredIntegrations,
          ) as string[];
        } catch {
          // Si le parsing échoue, on ignore
        }
      }

      if (requiredIntegrations.length > 0) {
        // Récupérer les intégrations connectées de l'utilisateur
        const { getComposioClient } = await import("~/server/utils/composio");
        const composio = getComposioClient();
        const connectedAccounts = await composio.connectedAccounts.list({
          userIds: [userId],
        });

        const connectedSlugs = new Set(
          connectedAccounts.items
            .filter((account) => account.status === "ACTIVE")
            .map((account) => {
              const slug = account.toolkit?.slug ?? "";
              return slug.toLowerCase().replace(/-/g, "");
            }),
        );

        // Normaliser les slugs requis pour la comparaison
        const normalizeSlug = (slug: string) =>
          slug.toLowerCase().replace(/-/g, "");

        const missingIntegrations = requiredIntegrations.filter(
          (requiredSlug) => !connectedSlugs.has(normalizeSlug(requiredSlug)),
        );

        if (missingIntegrations.length > 0) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `Les intégrations suivantes doivent être connectées : ${missingIntegrations.join(", ")}`,
            cause: { missingIntegrations },
          });
        }
      }

      // Récupérer les messages existants
      const messages = JSON.parse(chatSession.messages || "[]") as Array<{
        role: "user" | "assistant";
        content: string;
        timestamp: string;
      }>;

      // Ajouter le message de l'utilisateur
      const userMessage = {
        role: "user" as const,
        content: input.message,
        timestamp: new Date().toISOString(),
      };
      messages.push(userMessage);

      // Sauvegarder le message utilisateur en DB AVANT d'appeler Langflow
      await ctx.db.chatSession.update({
        where: { id: chatSession.id },
        data: {
          messages: JSON.stringify(messages),
        },
      });

      // Générer un titre si c'est le premier message
      let title = chatSession.title;
      if (!title || title === "Nouvelle conversation") {
        // Utiliser les premiers mots du message comme titre
        title = input.message.slice(0, 50).trim();
        if (input.message.length > 50) {
          title += "...";
        }
        await ctx.db.chatSession.update({
          where: { id: chatSession.id },
          data: { title },
        });
      }

      // Retourner immédiatement - le frontend utilisera l'endpoint SSE pour recevoir la réponse
      return {
        message: userMessage,
        sessionId: chatSession.id,
        streaming: true, // Indique que la réponse sera streamée via SSE
      };
    }),

  /**
   * Supprimer une session de chat
   */
  deleteSession: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const session = await ctx.db.chatSession.findFirst({
        where: {
          id: input.sessionId,
          userId,
        },
      });

      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Session non trouvée",
        });
      }

      await ctx.db.chatSession.delete({
        where: {
          id: input.sessionId,
        },
      });

      return { success: true };
    }),
});
