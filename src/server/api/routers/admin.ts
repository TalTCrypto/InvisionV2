import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, adminProcedure } from "~/server/api/trpc";
import { createAdminUser } from "~/server/utils/admin";

export const adminRouter = createTRPCRouter({
  /**
   * Créer un compte admin
   * Procédure admin - nécessite le rôle admin
   */
  createAdmin: adminProcedure
    .input(
      z.object({
        email: z.string().email("Email invalide"),
        password: z
          .string()
          .min(8, "Le mot de passe doit contenir au moins 8 caractères"),
        name: z.string().min(1, "Le nom est requis").optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await createAdminUser(ctx.db, {
          email: input.email,
          password: input.password,
          name: input.name,
        });
        return result;
      } catch (error) {
        if (error instanceof Error && error.message.includes("existe déjà")) {
          throw new TRPCError({
            code: "CONFLICT",
            message: error.message,
          });
        }
        throw error;
      }
    }),

  /**
   * Lister tous les utilisateurs (admin seulement)
   */
  listUsers: adminProcedure.query(async ({ ctx }) => {
    const users = await ctx.db.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        emailVerified: true,
        role: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return users;
  }),

  /**
   * Obtenir les détails d'un utilisateur (admin seulement)
   */
  getUser: adminProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: input.userId },
        select: {
          id: true,
          email: true,
          name: true,
          emailVerified: true,
          role: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Utilisateur non trouvé",
        });
      }

      return user;
    }),

  // ============================================
  // GESTION DES WORKFLOWS LANGFLOW (ADMIN ONLY)
  // ============================================

  /**
   * Lister tous les workflows (admin seulement)
   */
  listWorkflows: adminProcedure.query(async ({ ctx }) => {
    try {
      const workflows = await ctx.db.langflowWorkflow.findMany({
        include: {
          organizations: {
            include: {
              organization: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      return workflows.map((wf) => {
        // Parser les JSON en toute sécurité
        let config = null;
        let allowedRoles = null;
        let allowedUserIds = null;

        try {
          config = wf.config
            ? (JSON.parse(wf.config) as Record<string, unknown>)
            : null;
        } catch {
          config = null;
        }

        try {
          allowedRoles = wf.allowedRoles
            ? (JSON.parse(wf.allowedRoles) as string[])
            : null;
        } catch {
          allowedRoles = null;
        }

        try {
          allowedUserIds = wf.allowedUserIds
            ? (JSON.parse(wf.allowedUserIds) as string[])
            : null;
        } catch {
          allowedUserIds = null;
        }

        return {
          id: wf.id,
          name: wf.name,
          description: wf.description,
          workflowId: wf.workflowId,
          category: wf.category,
          isActive: wf.isActive,
          allOrganizations:
            (wf as { allOrganizations?: boolean }).allOrganizations ?? false,
          config,
          allowedRoles,
          allowedUserIds,
          requiredIntegrations: (wf as { requiredIntegrations?: string | null }).requiredIntegrations
            ? (JSON.parse((wf as { requiredIntegrations: string }).requiredIntegrations) as string[])
            : null,
          organizations: (wf.organizations ?? [])
            .map((wo) => {
              if (!wo.organization) {
                return null;
              }

              let orgAllowedRoles = null;
              let orgAllowedUserIds = null;

              try {
                orgAllowedRoles = wo.allowedRoles
                  ? (JSON.parse(wo.allowedRoles) as string[])
                  : null;
              } catch {
                orgAllowedRoles = null;
              }

              try {
                orgAllowedUserIds = wo.allowedUserIds
                  ? (JSON.parse(wo.allowedUserIds) as string[])
                  : null;
              } catch {
                orgAllowedUserIds = null;
              }

              return {
                id: wo.organization.id,
                name: wo.organization.name,
                slug: wo.organization.slug,
                allowedRoles: orgAllowedRoles,
                allowedUserIds: orgAllowedUserIds,
              };
            })
            .filter((org) => org !== null) as Array<{
            id: string;
            name: string;
            slug: string;
            allowedRoles: string[] | null;
            allowedUserIds: string[] | null;
          }>,
          createdAt: wf.createdAt,
          updatedAt: wf.updatedAt,
        };
      });
    } catch (error) {
      console.error("Erreur dans listWorkflows:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Erreur lors de la récupération des workflows",
      });
    }
  }),

  /**
   * Créer un workflow et l'assigner à une organisation (admin seulement)
   */
  createWorkflow: adminProcedure
    .input(
      z.object({
        organizationIds: z.array(z.string()).optional(), // IDs des organisations (vide = toutes si allOrganizations = true)
        allOrganizations: z.boolean().default(false), // Si true, accessible à toutes les organisations
        name: z.string().min(1, "Le nom est requis"),
        description: z.string().optional(),
        workflowId: z.string().min(1, "L'ID du workflow Langflow est requis"),
        category: z.string().min(1, "La catégorie est requise"),
        isActive: z.boolean().default(true),
        config: z.record(z.unknown()).optional(), // Config avec tweaks
        allowedRoles: z.array(z.string()).optional(), // Rôles flexibles (string[] au lieu d'enum)
        allowedUserIds: z.array(z.string()).optional(),
        requiredIntegrations: z.array(z.string()).optional(), // Slugs des intégrations requises
        // Restrictions par organisation (optionnel)
        organizationRestrictions: z
          .array(
            z.object({
              organizationId: z.string(),
              allowedRoles: z.array(z.string()).optional(),
              allowedUserIds: z.array(z.string()).optional(),
            }),
          )
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Si allOrganizations est false, on doit avoir au moins une organisation
      if (
        !input.allOrganizations &&
        (!input.organizationIds || input.organizationIds.length === 0)
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Vous devez sélectionner au moins une organisation ou activer 'Toutes les organisations'",
        });
      }

      // Vérifier que les organisations existent
      if (input.organizationIds && input.organizationIds.length > 0) {
        const organizations = await ctx.db.organization.findMany({
          where: {
            id: { in: input.organizationIds },
          },
        });

        if (organizations.length !== input.organizationIds.length) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Une ou plusieurs organisations n'ont pas été trouvées",
          });
        }
      }

      // Créer le workflow
      const workflow = await ctx.db.langflowWorkflow.create({
        data: {
          name: input.name,
          description: input.description,
          workflowId: input.workflowId,
          category: input.category,
          isActive: input.isActive,
          allOrganizations: input.allOrganizations,
          config: input.config ? JSON.stringify(input.config) : null,
          allowedRoles: input.allowedRoles
            ? JSON.stringify(input.allowedRoles)
            : null,
          allowedUserIds: input.allowedUserIds
            ? JSON.stringify(input.allowedUserIds)
            : null,
          requiredIntegrations: input.requiredIntegrations
            ? JSON.stringify(input.requiredIntegrations)
            : null,
          organizations: {
            create: input.allOrganizations
              ? [] // Si toutes les organisations, pas besoin de créer des liens
              : (input.organizationIds ?? []).map((orgId) => {
                  const orgRestriction = input.organizationRestrictions?.find(
                    (r) => r.organizationId === orgId,
                  );
                  return {
                    organizationId: orgId,
                    allowedRoles: orgRestriction?.allowedRoles
                      ? JSON.stringify(orgRestriction.allowedRoles)
                      : null,
                    allowedUserIds: orgRestriction?.allowedUserIds
                      ? JSON.stringify(orgRestriction.allowedUserIds)
                      : null,
                  };
                }),
          },
        },
        include: {
          organizations: {
            include: {
              organization: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                },
              },
            },
          },
        },
      });

      return {
        id: workflow.id,
        name: workflow.name,
        description: workflow.description,
        workflowId: workflow.workflowId,
        category: workflow.category,
        isActive: workflow.isActive,
        allOrganizations: workflow.allOrganizations,
        config: workflow.config
          ? (JSON.parse(workflow.config) as Record<string, unknown>)
          : null,
        allowedRoles: workflow.allowedRoles
          ? (JSON.parse(workflow.allowedRoles) as string[])
          : null,
        allowedUserIds: workflow.allowedUserIds
          ? (JSON.parse(workflow.allowedUserIds) as string[])
          : null,
        organizations: workflow.organizations.map((wo) => ({
          id: wo.organization.id,
          name: wo.organization.name,
          slug: wo.organization.slug,
          allowedRoles: wo.allowedRoles
            ? (JSON.parse(wo.allowedRoles) as string[])
            : null,
          allowedUserIds: wo.allowedUserIds
            ? (JSON.parse(wo.allowedUserIds) as string[])
            : null,
        })),
        createdAt: workflow.createdAt,
        updatedAt: workflow.updatedAt,
      };
    }),

  /**
   * Mettre à jour un workflow (admin seulement)
   */
  updateWorkflow: adminProcedure
    .input(
      z.object({
        workflowId: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        workflowIdLangflow: z.string().min(1).optional(),
        category: z.string().min(1).optional(),
        isActive: z.boolean().optional(),
        allOrganizations: z.boolean().optional(),
        config: z.record(z.unknown()).optional(), // Config avec tweaks
        allowedRoles: z.array(z.string()).optional(), // Rôles flexibles
        allowedUserIds: z.array(z.string()).optional(),
        requiredIntegrations: z.array(z.string()).optional(), // Slugs des intégrations requises
        organizationIds: z.array(z.string()).optional(), // Mettre à jour les organisations assignées
        organizationRestrictions: z
          .array(
            z.object({
              organizationId: z.string(),
              allowedRoles: z.array(z.string()).optional(),
              allowedUserIds: z.array(z.string()).optional(),
            }),
          )
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const {
        workflowId,
        organizationIds,
        organizationRestrictions,
        ...updateData
      } = input;

      // Vérifier que le workflow existe
      const existing = await ctx.db.langflowWorkflow.findUnique({
        where: { id: workflowId },
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Workflow non trouvé",
        });
      }

      // Mettre à jour les organisations assignées si fourni
      if (organizationIds !== undefined) {
        // Supprimer toutes les assignations existantes
        await ctx.db.workflowOrganization.deleteMany({
          where: { workflowId },
        });

        // Créer les nouvelles assignations (sauf si allOrganizations = true)
        if (!updateData.allOrganizations && organizationIds.length > 0) {
          await ctx.db.workflowOrganization.createMany({
            data: organizationIds.map((orgId) => {
              const orgRestriction = organizationRestrictions?.find(
                (r) => r.organizationId === orgId,
              );
              return {
                workflowId,
                organizationId: orgId,
                allowedRoles: orgRestriction?.allowedRoles
                  ? JSON.stringify(orgRestriction.allowedRoles)
                  : null,
                allowedUserIds: orgRestriction?.allowedUserIds
                  ? JSON.stringify(orgRestriction.allowedUserIds)
                  : null,
              };
            }),
          });
        }
      } else if (organizationRestrictions) {
        // Mettre à jour les restrictions par organisation
        for (const restriction of organizationRestrictions) {
          await ctx.db.workflowOrganization.updateMany({
            where: {
              workflowId,
              organizationId: restriction.organizationId,
            },
            data: {
              allowedRoles: restriction.allowedRoles
                ? JSON.stringify(restriction.allowedRoles)
                : null,
              allowedUserIds: restriction.allowedUserIds
                ? JSON.stringify(restriction.allowedUserIds)
                : null,
            },
          });
        }
      }

      const workflow = await ctx.db.langflowWorkflow.update({
        where: { id: workflowId },
        data: {
          ...(updateData.name && { name: updateData.name }),
          ...(updateData.description !== undefined && {
            description: updateData.description,
          }),
          ...(updateData.workflowIdLangflow && {
            workflowId: updateData.workflowIdLangflow,
          }),
          ...(updateData.category && { category: updateData.category }),
          ...(updateData.isActive !== undefined && {
            isActive: updateData.isActive,
          }),
          ...(updateData.allOrganizations !== undefined && {
            allOrganizations: updateData.allOrganizations,
          }),
          ...(updateData.config && {
            config: JSON.stringify(updateData.config),
          }),
          ...(updateData.allowedRoles !== undefined && {
            allowedRoles: updateData.allowedRoles
              ? JSON.stringify(updateData.allowedRoles)
              : null,
          }),
          ...(updateData.allowedUserIds !== undefined && {
            allowedUserIds: updateData.allowedUserIds
              ? JSON.stringify(updateData.allowedUserIds)
              : null,
          }),
          ...(updateData.requiredIntegrations !== undefined && {
            requiredIntegrations: updateData.requiredIntegrations.length > 0
              ? JSON.stringify(updateData.requiredIntegrations)
              : null,
          }),
        },
        include: {
          organizations: {
            include: {
              organization: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                },
              },
            },
          },
        },
      });

      return {
        id: workflow.id,
        name: workflow.name,
        description: workflow.description,
        workflowId: workflow.workflowId,
        category: workflow.category,
        isActive: workflow.isActive,
        allOrganizations: workflow.allOrganizations,
        config: workflow.config
          ? (JSON.parse(workflow.config) as Record<string, unknown>)
          : null,
        allowedRoles: workflow.allowedRoles
          ? (JSON.parse(workflow.allowedRoles) as string[])
          : null,
        allowedUserIds: workflow.allowedUserIds
          ? (JSON.parse(workflow.allowedUserIds) as string[])
          : null,
        organizations: workflow.organizations.map((wo) => ({
          id: wo.organization.id,
          name: wo.organization.name,
          slug: wo.organization.slug,
          allowedRoles: wo.allowedRoles
            ? (JSON.parse(wo.allowedRoles) as string[])
            : null,
          allowedUserIds: wo.allowedUserIds
            ? (JSON.parse(wo.allowedUserIds) as string[])
            : null,
        })),
        createdAt: workflow.createdAt,
        updatedAt: workflow.updatedAt,
      };
    }),

  /**
   * Supprimer un workflow (admin seulement)
   */
  deleteWorkflow: adminProcedure
    .input(z.object({ workflowId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const workflow = await ctx.db.langflowWorkflow.findUnique({
        where: { id: input.workflowId },
      });

      if (!workflow) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Workflow non trouvé",
        });
      }

      await ctx.db.langflowWorkflow.delete({
        where: { id: input.workflowId },
      });

      return { success: true };
    }),

  /**
   * Lister les membres d'une organisation (admin seulement)
   */
  listOrganizationMembers: adminProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const members = await ctx.db.member.findMany({
        where: {
          organizationId: input.organizationId,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      return members.map((m) => ({
        userId: m.userId,
        userName: m.user.name,
        userEmail: m.user.email,
        role: m.role,
      }));
    }),

  /**
   * Lister toutes les organisations (admin seulement)
   */
  listOrganizations: adminProcedure.query(async ({ ctx }) => {
    const organizations = await ctx.db.organization.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        createdAt: true,
        _count: {
          select: {
            members: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Compter les workflows via WorkflowOrganization
    const workflowsCounts = await ctx.db.workflowOrganization.groupBy({
      by: ["organizationId"],
      _count: {
        id: true,
      },
    });

    // Compter aussi les workflows accessibles à toutes les organisations
    const allOrgsWorkflowsCount = await ctx.db.langflowWorkflow.count({
      where: {
        allOrganizations: true,
      },
    });

    const workflowsCountMap = new Map(
      workflowsCounts.map((w) => [w.organizationId, w._count.id]),
    );

    return organizations.map((org) => {
      const specificWorkflowsCount: number = workflowsCountMap.get(org.id) ?? 0;
      const totalWorkflowsCount: number =
        specificWorkflowsCount + allOrgsWorkflowsCount;
      return {
        id: org.id,
        name: org.name,
        slug: org.slug,
        membersCount: org._count.members,
        workflowsCount: totalWorkflowsCount,
        createdAt: org.createdAt,
      };
    });
  }),
});
