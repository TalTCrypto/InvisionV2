import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

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
});
