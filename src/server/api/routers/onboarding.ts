import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

export const onboardingRouter = createTRPCRouter({
  /**
   * Obtenir l'état de l'onboarding de l'utilisateur
   */
  getStatus: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { id: ctx.session.user.id },
    });

    if (!user) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Utilisateur non trouvé",
      });
    }

    return {
      completed: user.onboardingCompleted ?? false,
    };
  }),

  /**
   * Finaliser l'onboarding - sauvegarde tout à la fin
   */
  completeOnboarding: protectedProcedure
    .input(
      z.object({
        organization: z.object({
          name: z.string().min(1, "Le nom est requis"),
          metadata: z
            .object({
              // Business info
              industry: z.string().optional(),
              size: z.string().optional(),
              revenue: z.string().optional(),
              country: z.string().optional(),
              website: z.string().optional(),
              timezone: z.string().optional(),
              // Avatar client
              avatar: z
                .object({
                  businessType: z.string().optional(),
                  teamSize: z.string().optional(),
                  experience: z.string().optional(),
                  decisionStyle: z.string().optional(),
                  communicationStyle: z.string().optional(),
                  bio: z.string().optional(),
                })
                .optional(),
              // Business Model
              businessModel: z
                .object({
                  businessModel: z.string().optional(),
                  revenueStreams: z.array(z.string()).optional(),
                  targetAudience: z.string().optional(),
                  valueProposition: z.string().optional(),
                  industry: z.string().optional(),
                  size: z.string().optional(),
                  revenue: z.string().optional(),
                  country: z.string().optional(),
                })
                .optional(),
              // Goals & challenges
              goals: z
                .object({
                  primaryGoal: z.string().optional(),
                  challenges: z.array(z.string()).optional(),
                  kpis: z.string().optional(),
                  growthStage: z.string().optional(),
                })
                .optional(),
              // Integrations
              integrations: z.array(z.string()).optional(),
            })
            .optional(),
        }),
        quiz: z
          .object({
            answers: z.record(z.string()),
          })
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Générer le slug à partir du nom
      const baseSlug = input.organization.name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

      // Vérifier si le slug existe déjà et ajouter un suffixe si nécessaire
      let slug = baseSlug;
      let counter = 1;
      let existingOrg = await ctx.db.organization.findUnique({
        where: { slug },
      });

      while (existingOrg) {
        slug = `${baseSlug}-${counter}`;
        existingOrg = await ctx.db.organization.findUnique({
          where: { slug },
        });
        counter++;
      }

      // Créer l'organisation
      const organization = await ctx.db.organization.create({
        data: {
          name: input.organization.name,
          slug,
          metadata: input.organization.metadata
            ? JSON.stringify(input.organization.metadata)
            : null,
        },
      });

      // Créer le membre avec le rôle "owner"
      await ctx.db.member.create({
        data: {
          organizationId: organization.id,
          userId,
          role: "owner",
        },
      });

      // Sauvegarder toutes les étapes d'onboarding
      const metadata = input.organization.metadata ?? {};
      const steps = [
        { stepKey: "welcome", completed: true, data: null },
        {
          stepKey: "organization",
          completed: true,
          data: JSON.stringify({ organizationId: organization.id }),
        },
        {
          stepKey: "avatar",
          completed: true,
          data: metadata.avatar ? JSON.stringify(metadata.avatar) : null,
        },
        {
          stepKey: "business-model",
          completed: true,
          data: metadata.businessModel
            ? JSON.stringify(metadata.businessModel)
            : null,
        },
        {
          stepKey: "goals",
          completed: true,
          data: metadata.goals ? JSON.stringify(metadata.goals) : null,
        },
        {
          stepKey: "integrations",
          completed: true,
          data: metadata.integrations
            ? JSON.stringify({ integrations: metadata.integrations })
            : null,
        },
        {
          stepKey: "quiz",
          completed: true,
          data: input.quiz ? JSON.stringify(input.quiz.answers) : null,
        },
      ];

      // Créer toutes les étapes
      for (const step of steps) {
        await ctx.db.onboardingStep.upsert({
          where: {
            userId_stepKey: {
              userId,
              stepKey: step.stepKey,
            },
          },
          create: {
            userId,
            stepKey: step.stepKey,
            completed: step.completed,
            data: step.data,
          },
          update: {
            completed: step.completed,
            data: step.data,
          },
        });
      }

      // Marquer l'onboarding comme complété
      await ctx.db.user.update({
        where: { id: userId },
        data: { onboardingCompleted: true },
      });

      return {
        success: true as const,
        organization: {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
        },
      };
    }),

  /**
   * Créer une organisation (via Better Auth)
   */
  createOrganization: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1, "Le nom est requis"),
        metadata: z
          .object({
            industry: z.string().optional(),
            size: z.string().optional(),
            revenue: z.string().optional(),
            country: z.string().optional(),
            website: z.string().optional(),
          })
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Générer le slug à partir du nom
      const baseSlug = input.name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

      // Vérifier si le slug existe déjà et ajouter un suffixe si nécessaire
      let slug = baseSlug;
      let counter = 1;
      let existingOrg = await ctx.db.organization.findUnique({
        where: { slug },
      });

      while (existingOrg) {
        slug = `${baseSlug}-${counter}`;
        existingOrg = await ctx.db.organization.findUnique({
          where: { slug },
        });
        counter++;
      }

      // Vérifier si l'utilisateur a déjà une organisation (via l'étape onboarding)
      const existingStep = await ctx.db.onboardingStep.findUnique({
        where: {
          userId_stepKey: {
            userId,
            stepKey: "organization",
          },
        },
      });

      // Si l'étape existe et contient un organizationId, récupérer cette organisation
      if (existingStep?.data) {
        try {
          const stepData = JSON.parse(existingStep.data) as {
            organizationId?: string;
          };
          if (stepData.organizationId) {
            const existingOrganization = await ctx.db.organization.findUnique({
              where: { id: stepData.organizationId },
            });
            if (existingOrganization) {
              // L'organisation existe déjà, on la retourne
              return {
                success: true as const,
                organization: {
                  id: existingOrganization.id,
                  name: existingOrganization.name,
                  slug: existingOrganization.slug,
                },
              };
            }
          }
        } catch {
          // Ignore JSON parse errors
        }
      }

      // Créer l'organisation via Better Auth
      // Note: On utilise directement Prisma car Better Auth n'expose pas encore
      // de méthode directe pour créer une organisation depuis le serveur
      const organization = await ctx.db.organization.create({
        data: {
          name: input.name,
          slug,
          metadata: input.metadata ? JSON.stringify(input.metadata) : null,
        },
      });

      // Créer le membre avec le rôle "owner"
      await ctx.db.member.create({
        data: {
          organizationId: organization.id,
          userId,
          role: "owner",
        },
      });

      // Marquer l'étape organization comme complétée
      await ctx.db.onboardingStep.upsert({
        where: {
          userId_stepKey: {
            userId,
            stepKey: "organization",
          },
        },
        create: {
          userId,
          stepKey: "organization",
          completed: true,
          data: JSON.stringify({ organizationId: organization.id }),
        },
        update: {
          completed: true,
          data: JSON.stringify({ organizationId: organization.id }),
        },
      });

      return {
        success: true as const,
        organization: {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
        },
      };
    }),
});
