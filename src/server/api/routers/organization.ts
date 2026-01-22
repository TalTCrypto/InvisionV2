import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  type Permission,
  ALL_PERMISSIONS,
  getDefaultPermissions,
  parsePermissions,
  serializePermissions,
  hasPermission,
} from "~/lib/permissions";

export const organizationRouter = createTRPCRouter({
  /**
   * Récupérer toutes les organisations de l'utilisateur
   */
  getUserOrganizations: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const members = await ctx.db.member.findMany({
      where: { userId },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
            logo: true,
            createdAt: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return members.map((member) => ({
      id: member.organization.id,
      name: member.organization.name,
      slug: member.organization.slug,
      logo: member.organization.logo,
      role: member.role,
      createdAt: member.organization.createdAt,
    }));
  }),

  /**
   * Récupérer l'organisation actuelle de l'utilisateur
   */
  getCurrentOrganization: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    // Récupérer la session depuis la base de données pour obtenir activeOrganizationId
    const session = await ctx.db.session.findFirst({
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

    // Si une organisation active est définie dans la session
    if (session?.activeOrganizationId) {
      const member = await ctx.db.member.findFirst({
        where: {
          userId,
          organizationId: session.activeOrganizationId,
        },
        include: {
          organization: true,
        },
      });

      if (member) {
        return {
          id: member.organization.id,
          name: member.organization.name,
          slug: member.organization.slug,
          logo: member.organization.logo,
          metadata: member.organization.metadata
            ? (JSON.parse(member.organization.metadata) as Record<
                string,
                unknown
              >)
            : null,
          role: member.role,
        };
      }
    }

    // Sinon, prendre la première organisation de l'utilisateur
    const firstMember = await ctx.db.member.findFirst({
      where: { userId },
      include: {
        organization: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (!firstMember) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Aucune organisation trouvée",
      });
    }

    return {
      id: firstMember.organization.id,
      name: firstMember.organization.name,
      slug: firstMember.organization.slug,
      logo: firstMember.organization.logo,
      metadata: firstMember.organization.metadata
        ? (JSON.parse(firstMember.organization.metadata) as Record<
            string,
            unknown
          >)
        : null,
      role: firstMember.role,
    };
  }),

  /**
   * Changer l'organisation active
   */
  setActiveOrganization: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Vérifier que l'utilisateur est membre de cette organisation
      const member = await ctx.db.member.findFirst({
        where: {
          userId,
          organizationId: input.organizationId,
        },
      });

      if (!member) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Vous n'êtes pas membre de cette organisation",
        });
      }

      // Mettre à jour la session avec l'organisation active
      const session = await ctx.db.session.findFirst({
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

      if (session) {
        await ctx.db.session.update({
          where: {
            id: session.id,
          },
          data: {
            activeOrganizationId: input.organizationId,
          },
        });
      }

      return { success: true, organizationId: input.organizationId };
    }),

  /**
   * Récupérer les permissions de l'utilisateur courant pour l'organisation active
   */
  getMyPermissions: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    // Récupérer l'organisation active
    const session = await ctx.db.session.findFirst({
      where: {
        userId,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    let organizationId = session?.activeOrganizationId;

    if (!organizationId) {
      const firstMember = await ctx.db.member.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
      });
      organizationId = firstMember?.organizationId;
    }

    if (!organizationId) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Aucune organisation trouvée",
      });
    }

    // Récupérer le membre et son rôle
    const member = await ctx.db.member.findFirst({
      where: { userId, organizationId },
    });

    if (!member) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Vous n'êtes pas membre de cette organisation",
      });
    }

    // Chercher les permissions custom pour ce rôle
    const customRole = await ctx.db.organizationRole.findFirst({
      where: { organizationId, role: member.role },
    });

    const permissions = customRole
      ? parsePermissions(customRole.permission)
      : getDefaultPermissions(member.role);

    return {
      role: member.role,
      permissions,
    };
  }),

  /**
   * Vérifier si l'utilisateur a une permission spécifique
   */
  checkPermission: protectedProcedure
    .input(z.object({ permission: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const session = await ctx.db.session.findFirst({
        where: {
          userId,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: "desc" },
      });

      let organizationId = session?.activeOrganizationId;

      if (!organizationId) {
        const firstMember = await ctx.db.member.findFirst({
          where: { userId },
          orderBy: { createdAt: "desc" },
        });
        organizationId = firstMember?.organizationId;
      }

      if (!organizationId) return { hasPermission: false };

      const member = await ctx.db.member.findFirst({
        where: { userId, organizationId },
      });

      if (!member) return { hasPermission: false };

      const customRole = await ctx.db.organizationRole.findFirst({
        where: { organizationId, role: member.role },
      });

      const permissions = customRole
        ? parsePermissions(customRole.permission)
        : getDefaultPermissions(member.role);

      return {
        hasPermission: hasPermission(
          permissions,
          input.permission as Permission,
        ),
      };
    }),

  /**
   * Récupérer les membres de l'organisation
   */
  getMembers: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const session = await ctx.db.session.findFirst({
      where: {
        userId,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    let organizationId = session?.activeOrganizationId;

    if (!organizationId) {
      const firstMember = await ctx.db.member.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
      });
      organizationId = firstMember?.organizationId;
    }

    if (!organizationId) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Aucune organisation trouvée",
      });
    }

    const members = await ctx.db.member.findMany({
      where: { organizationId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return members.map((m) => ({
      id: m.id,
      userId: m.userId,
      role: m.role,
      createdAt: m.createdAt,
      user: m.user,
    }));
  }),

  /**
   * Inviter un membre
   */
  inviteMember: protectedProcedure
    .input(
      z.object({
        email: z.string().email(),
        role: z.string().default("member"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const session = await ctx.db.session.findFirst({
        where: {
          userId,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: "desc" },
      });

      let organizationId = session?.activeOrganizationId;

      if (!organizationId) {
        const firstMember = await ctx.db.member.findFirst({
          where: { userId },
          orderBy: { createdAt: "desc" },
        });
        organizationId = firstMember?.organizationId;
      }

      if (!organizationId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Aucune organisation trouvée",
        });
      }

      // Vérifier les permissions
      const member = await ctx.db.member.findFirst({
        where: { userId, organizationId },
      });

      if (!member) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Vous n'êtes pas membre de cette organisation",
        });
      }

      const customRole = await ctx.db.organizationRole.findFirst({
        where: { organizationId, role: member.role },
      });

      const permissions = customRole
        ? parsePermissions(customRole.permission)
        : getDefaultPermissions(member.role);

      if (!hasPermission(permissions, "members:invite")) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Vous n'avez pas la permission d'inviter des membres",
        });
      }

      // Vérifier si une invitation existe déjà
      const existingInvitation = await ctx.db.invitation.findFirst({
        where: {
          organizationId,
          email: input.email,
          status: "pending",
        },
      });

      if (existingInvitation) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Une invitation est déjà en attente pour cet email",
        });
      }

      // Vérifier si l'utilisateur est déjà membre
      const existingUser = await ctx.db.user.findFirst({
        where: { email: input.email },
      });

      if (existingUser) {
        const existingMember = await ctx.db.member.findFirst({
          where: { userId: existingUser.id, organizationId },
        });

        if (existingMember) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Cet utilisateur est déjà membre de l'organisation",
          });
        }
      }

      // Créer l'invitation
      const invitation = await ctx.db.invitation.create({
        data: {
          organizationId,
          email: input.email,
          role: input.role,
          inviterId: userId,
          status: "pending",
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 jours
        },
      });

      return invitation;
    }),

  /**
   * Récupérer les invitations en attente
   */
  getPendingInvitations: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const session = await ctx.db.session.findFirst({
      where: {
        userId,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    let organizationId = session?.activeOrganizationId;

    if (!organizationId) {
      const firstMember = await ctx.db.member.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
      });
      organizationId = firstMember?.organizationId;
    }

    if (!organizationId) {
      return [];
    }

    const invitations = await ctx.db.invitation.findMany({
      where: {
        organizationId,
        status: "pending",
      },
      include: {
        inviter: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return invitations;
  }),

  /**
   * Annuler une invitation
   */
  cancelInvitation: protectedProcedure
    .input(z.object({ invitationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const invitation = await ctx.db.invitation.findUnique({
        where: { id: input.invitationId },
      });

      if (!invitation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invitation non trouvée",
        });
      }

      // Vérifier les permissions
      const member = await ctx.db.member.findFirst({
        where: { userId, organizationId: invitation.organizationId },
      });

      if (!member) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Vous n'êtes pas membre de cette organisation",
        });
      }

      const customRole = await ctx.db.organizationRole.findFirst({
        where: { organizationId: invitation.organizationId, role: member.role },
      });

      const permissions = customRole
        ? parsePermissions(customRole.permission)
        : getDefaultPermissions(member.role);

      if (!hasPermission(permissions, "members:invite")) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Vous n'avez pas la permission de gérer les invitations",
        });
      }

      await ctx.db.invitation.update({
        where: { id: input.invitationId },
        data: { status: "canceled" },
      });

      return { success: true };
    }),

  /**
   * Retirer un membre
   */
  removeMember: protectedProcedure
    .input(z.object({ memberId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const memberToRemove = await ctx.db.member.findUnique({
        where: { id: input.memberId },
      });

      if (!memberToRemove) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Membre non trouvé",
        });
      }

      // Empêcher de se retirer soi-même
      if (memberToRemove.userId === userId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Vous ne pouvez pas vous retirer vous-même",
        });
      }

      // Empêcher de retirer le owner
      if (memberToRemove.role === "owner") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Impossible de retirer le propriétaire de l'organisation",
        });
      }

      // Vérifier les permissions
      const currentMember = await ctx.db.member.findFirst({
        where: { userId, organizationId: memberToRemove.organizationId },
      });

      if (!currentMember) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Vous n'êtes pas membre de cette organisation",
        });
      }

      const customRole = await ctx.db.organizationRole.findFirst({
        where: {
          organizationId: memberToRemove.organizationId,
          role: currentMember.role,
        },
      });

      const permissions = customRole
        ? parsePermissions(customRole.permission)
        : getDefaultPermissions(currentMember.role);

      if (!hasPermission(permissions, "members:remove")) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Vous n'avez pas la permission de retirer des membres",
        });
      }

      await ctx.db.member.delete({
        where: { id: input.memberId },
      });

      return { success: true };
    }),

  /**
   * Modifier le rôle d'un membre
   */
  updateMemberRole: protectedProcedure
    .input(
      z.object({
        memberId: z.string(),
        role: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const memberToUpdate = await ctx.db.member.findUnique({
        where: { id: input.memberId },
      });

      if (!memberToUpdate) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Membre non trouvé",
        });
      }

      // Empêcher de modifier le rôle du owner
      if (memberToUpdate.role === "owner") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Impossible de modifier le rôle du propriétaire",
        });
      }

      // Empêcher d'assigner le rôle owner
      if (input.role === "owner") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Impossible d'assigner le rôle propriétaire",
        });
      }

      // Vérifier les permissions
      const currentMember = await ctx.db.member.findFirst({
        where: { userId, organizationId: memberToUpdate.organizationId },
      });

      if (!currentMember) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Vous n'êtes pas membre de cette organisation",
        });
      }

      const customRole = await ctx.db.organizationRole.findFirst({
        where: {
          organizationId: memberToUpdate.organizationId,
          role: currentMember.role,
        },
      });

      const permissions = customRole
        ? parsePermissions(customRole.permission)
        : getDefaultPermissions(currentMember.role);

      if (!hasPermission(permissions, "members:update_role")) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Vous n'avez pas la permission de modifier les rôles",
        });
      }

      await ctx.db.member.update({
        where: { id: input.memberId },
        data: { role: input.role },
      });

      return { success: true };
    }),

  /**
   * Récupérer les rôles de l'organisation
   */
  getRoles: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const session = await ctx.db.session.findFirst({
      where: {
        userId,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    let organizationId = session?.activeOrganizationId;

    if (!organizationId) {
      const firstMember = await ctx.db.member.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
      });
      organizationId = firstMember?.organizationId;
    }

    if (!organizationId) {
      return [];
    }

    const customRoles = await ctx.db.organizationRole.findMany({
      where: { organizationId },
      orderBy: { createdAt: "asc" },
    });

    return customRoles.map((r) => ({
      id: r.id,
      role: r.role,
      permissions: parsePermissions(r.permission),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }),

  /**
   * Créer un rôle custom
   */
  createRole: protectedProcedure
    .input(
      z.object({
        role: z.string().min(1),
        permissions: z.array(z.string()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const session = await ctx.db.session.findFirst({
        where: {
          userId,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: "desc" },
      });

      let organizationId = session?.activeOrganizationId;

      if (!organizationId) {
        const firstMember = await ctx.db.member.findFirst({
          where: { userId },
          orderBy: { createdAt: "desc" },
        });
        organizationId = firstMember?.organizationId;
      }

      if (!organizationId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Aucune organisation trouvée",
        });
      }

      // Vérifier les permissions
      const member = await ctx.db.member.findFirst({
        where: { userId, organizationId },
      });

      if (!member) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Vous n'êtes pas membre de cette organisation",
        });
      }

      const customRole = await ctx.db.organizationRole.findFirst({
        where: { organizationId, role: member.role },
      });

      const permissions = customRole
        ? parsePermissions(customRole.permission)
        : getDefaultPermissions(member.role);

      if (!hasPermission(permissions, "roles:manage")) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Vous n'avez pas la permission de gérer les rôles",
        });
      }

      // Vérifier que le rôle n'existe pas déjà
      const existingRole = await ctx.db.organizationRole.findFirst({
        where: { organizationId, role: input.role },
      });

      if (existingRole) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Ce rôle existe déjà",
        });
      }

      // Valider les permissions
      const validPermissions = input.permissions.filter((p): p is Permission =>
        ALL_PERMISSIONS.includes(p as Permission),
      );

      const newRole = await ctx.db.organizationRole.create({
        data: {
          organizationId,
          role: input.role,
          permission: serializePermissions(validPermissions),
        },
      });

      return {
        id: newRole.id,
        role: newRole.role,
        permissions: validPermissions,
      };
    }),

  /**
   * Modifier un rôle
   */
  updateRole: protectedProcedure
    .input(
      z.object({
        roleId: z.string(),
        permissions: z.array(z.string()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const roleToUpdate = await ctx.db.organizationRole.findUnique({
        where: { id: input.roleId },
      });

      if (!roleToUpdate) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Rôle non trouvé",
        });
      }

      // Vérifier les permissions
      const member = await ctx.db.member.findFirst({
        where: { userId, organizationId: roleToUpdate.organizationId },
      });

      if (!member) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Vous n'êtes pas membre de cette organisation",
        });
      }

      const customRole = await ctx.db.organizationRole.findFirst({
        where: {
          organizationId: roleToUpdate.organizationId,
          role: member.role,
        },
      });

      const permissions = customRole
        ? parsePermissions(customRole.permission)
        : getDefaultPermissions(member.role);

      if (!hasPermission(permissions, "roles:manage")) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Vous n'avez pas la permission de gérer les rôles",
        });
      }

      // Valider les permissions
      const validPermissions = input.permissions.filter((p): p is Permission =>
        ALL_PERMISSIONS.includes(p as Permission),
      );

      await ctx.db.organizationRole.update({
        where: { id: input.roleId },
        data: { permission: serializePermissions(validPermissions) },
      });

      return { success: true };
    }),

  /**
   * Supprimer un rôle
   */
  deleteRole: protectedProcedure
    .input(z.object({ roleId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const roleToDelete = await ctx.db.organizationRole.findUnique({
        where: { id: input.roleId },
      });

      if (!roleToDelete) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Rôle non trouvé",
        });
      }

      // Empêcher de supprimer owner
      if (roleToDelete.role === "owner") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Impossible de supprimer le rôle propriétaire",
        });
      }

      // Vérifier les permissions
      const member = await ctx.db.member.findFirst({
        where: { userId, organizationId: roleToDelete.organizationId },
      });

      if (!member) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Vous n'êtes pas membre de cette organisation",
        });
      }

      const customRole = await ctx.db.organizationRole.findFirst({
        where: {
          organizationId: roleToDelete.organizationId,
          role: member.role,
        },
      });

      const permissions = customRole
        ? parsePermissions(customRole.permission)
        : getDefaultPermissions(member.role);

      if (!hasPermission(permissions, "roles:manage")) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Vous n'avez pas la permission de gérer les rôles",
        });
      }

      // Vérifier qu'aucun membre n'utilise ce rôle
      const membersWithRole = await ctx.db.member.count({
        where: {
          organizationId: roleToDelete.organizationId,
          role: roleToDelete.role,
        },
      });

      if (membersWithRole > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Ce rôle est utilisé par ${membersWithRole} membre(s). Modifiez d'abord leur rôle.`,
        });
      }

      await ctx.db.organizationRole.delete({
        where: { id: input.roleId },
      });

      return { success: true };
    }),

  /**
   * Modifier les paramètres de l'organisation
   */
  updateOrganization: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).optional(),
        logo: z.string().url().optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const session = await ctx.db.session.findFirst({
        where: {
          userId,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: "desc" },
      });

      let organizationId = session?.activeOrganizationId;

      if (!organizationId) {
        const firstMember = await ctx.db.member.findFirst({
          where: { userId },
          orderBy: { createdAt: "desc" },
        });
        organizationId = firstMember?.organizationId;
      }

      if (!organizationId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Aucune organisation trouvée",
        });
      }

      // Vérifier les permissions
      const member = await ctx.db.member.findFirst({
        where: { userId, organizationId },
      });

      if (!member) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Vous n'êtes pas membre de cette organisation",
        });
      }

      const customRole = await ctx.db.organizationRole.findFirst({
        where: { organizationId, role: member.role },
      });

      const permissions = customRole
        ? parsePermissions(customRole.permission)
        : getDefaultPermissions(member.role);

      if (!hasPermission(permissions, "org:edit")) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Vous n'avez pas la permission de modifier l'organisation",
        });
      }

      const updateData: { name?: string; logo?: string | null } = {};
      if (input.name) updateData.name = input.name;
      if (input.logo !== undefined) updateData.logo = input.logo;

      const updated = await ctx.db.organization.update({
        where: { id: organizationId },
        data: updateData,
      });

      return updated;
    }),
});
