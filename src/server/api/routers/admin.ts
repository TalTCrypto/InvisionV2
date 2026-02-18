import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, adminProcedure } from "~/server/api/trpc";
import { createAdminUser, createBetaUser } from "~/server/utils/admin";

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
   * Lister tous les utilisateurs avec leur consommation API (admin seulement)
   */
  listUsersWithUsage: adminProcedure.query(async ({ ctx }) => {
    const users = await ctx.db.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        banned: true,
        banReason: true,
        createdAt: true,
        apiUsage: {
          select: {
            totalInputTokens: true,
            totalOutputTokens: true,
            totalCostCents: true,
            lastUpdatedAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return users;
  }),

  /**
   * Creer un compte beta user (admin seulement)
   */
  createBetaUser: adminProcedure
    .input(
      z.object({
        email: z.string().email("Email invalide"),
        password: z
          .string()
          .min(8, "Le mot de passe doit contenir au moins 8 caracteres"),
        name: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await createBetaUser(ctx.db, input);
      } catch (error) {
        if (error instanceof Error && error.message.includes("existe")) {
          throw new TRPCError({ code: "CONFLICT", message: error.message });
        }
        throw error;
      }
    }),

  /**
   * Bannir un utilisateur (admin seulement)
   */
  banUser: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        reason: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.user.update({
        where: { id: input.userId },
        data: { banned: true, banReason: input.reason },
      });
      return { success: true };
    }),

  /**
   * Debannir un utilisateur (admin seulement)
   */
  unbanUser: adminProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.user.update({
        where: { id: input.userId },
        data: { banned: false, banReason: null },
      });
      return { success: true };
    }),

  /**
   * Remettre a zero la consommation API d'un utilisateur (admin seulement)
   */
  resetUsage: adminProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.apiUsage.upsert({
        where: { userId: input.userId },
        create: { userId: input.userId },
        update: {
          totalInputTokens: 0,
          totalOutputTokens: 0,
          totalCostCents: 0,
        },
      });
      return { success: true };
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
});
