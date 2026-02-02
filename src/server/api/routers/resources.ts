import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { type db } from "~/server/db";
import { documentProcessor } from "~/server/services/langchain-processor";

async function getActiveOrganizationId(
  dbInstance: typeof db,
  userId: string,
): Promise<string | null> {
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

  if (session?.activeOrganizationId) {
    return session.activeOrganizationId;
  }

  const firstMember = await dbInstance.member.findFirst({
    where: { userId },
    orderBy: {
      createdAt: "desc",
    },
  });

  return firstMember?.organizationId ?? null;
}

export const resourcesRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        category: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const organizationId = await getActiveOrganizationId(ctx.db, userId);

      if (!organizationId) {
        return [];
      }

      const where = {
        organizationId,
        ...(input.category ? { category: input.category } : {}),
      };

      const resources = await ctx.db.businessResource.findMany({
        where,
        orderBy: {
          createdAt: "desc",
        },
        select: {
          id: true,
          title: true,
          category: true,
          content: true,
          processingStatus: true,
          processingError: true,
          metadata: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return resources;
    }),

  getCategories: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const organizationId = await getActiveOrganizationId(ctx.db, userId);

    if (!organizationId) {
      return [];
    }

    const resources = await ctx.db.businessResource.findMany({
      where: {
        organizationId,
        category: {
          not: null,
        },
      },
      select: {
        category: true,
      },
      distinct: ["category"],
    });

    return resources
      .map((r) => r.category)
      .filter((c): c is string => c !== null);
  }),

  getById: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const organizationId = await getActiveOrganizationId(ctx.db, userId);

      if (!organizationId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Organisation non trouvée",
        });
      }

      const resource = await ctx.db.businessResource.findFirst({
        where: {
          id: input.id,
          organizationId,
        },
      });

      if (!resource) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Ressource non trouvée",
        });
      }

      return resource;
    }),

  create: protectedProcedure
    .input(
      z.object({
        title: z
          .string()
          .min(1, "Le titre est requis")
          .max(200, "Le titre ne peut pas dépasser 200 caractères"),
        category: z
          .string()
          .max(100, "La catégorie ne peut pas dépasser 100 caractères")
          .optional(),
        content: z
          .string()
          .min(1, "Le contenu est requis")
          .max(
            1000000,
            "Le contenu ne peut pas dépasser 1 million de caractères",
          ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const organizationId = await getActiveOrganizationId(ctx.db, userId);

      if (!organizationId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Organisation non trouvée",
        });
      }

      const resource = await ctx.db.businessResource.create({
        data: {
          title: input.title,
          category: input.category,
          content: input.content,
          userId,
          organizationId,
          processingStatus: "pending",
          metadata: JSON.stringify({
            wordCount: input.content.split(/\s+/).length,
            charCount: input.content.length,
          }),
        },
      });

      void documentProcessor.processResource(
        resource.id,
        resource.content,
        async (data) => {
          await ctx.db.businessResource.update({
            where: { id: resource.id },
            data,
          });
        },
      );

      return resource;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z
          .string()
          .min(1)
          .max(200, "Le titre ne peut pas dépasser 200 caractères")
          .optional(),
        category: z
          .string()
          .max(100, "La catégorie ne peut pas dépasser 100 caractères")
          .optional(),
        content: z
          .string()
          .min(1)
          .max(
            1000000,
            "Le contenu ne peut pas dépasser 1 million de caractères",
          )
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const organizationId = await getActiveOrganizationId(ctx.db, userId);

      if (!organizationId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Organisation non trouvée",
        });
      }

      const existing = await ctx.db.businessResource.findFirst({
        where: {
          id: input.id,
          organizationId,
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Ressource non trouvée",
        });
      }

      const contentChanged =
        input.content && input.content !== existing.content;

      const updateData: {
        title?: string;
        category?: string;
        content?: string;
        processingStatus?: string;
        metadata?: string;
      } = {};

      if (input.title) updateData.title = input.title;
      if (input.category !== undefined) updateData.category = input.category;
      if (input.content) {
        updateData.content = input.content;
        updateData.metadata = JSON.stringify({
          wordCount: input.content.split(/\s+/).length,
          charCount: input.content.length,
        });
      }

      if (contentChanged) {
        updateData.processingStatus = "pending";
      }

      const resource = await ctx.db.businessResource.update({
        where: {
          id: input.id,
        },
        data: updateData,
      });

      return resource;
    }),

  delete: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const organizationId = await getActiveOrganizationId(ctx.db, userId);

      if (!organizationId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Organisation non trouvée",
        });
      }

      const existing = await ctx.db.businessResource.findFirst({
        where: {
          id: input.id,
          organizationId,
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Ressource non trouvée",
        });
      }

      await ctx.db.businessResource.delete({
        where: {
          id: input.id,
        },
      });

      return { success: true };
    }),

  processResource: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const organizationId = await getActiveOrganizationId(ctx.db, userId);

      if (!organizationId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Organisation non trouvée",
        });
      }

      const resource = await ctx.db.businessResource.findFirst({
        where: {
          id: input.id,
          organizationId,
        },
      });

      if (!resource) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Ressource non trouvée",
        });
      }

      void documentProcessor.processResource(
        resource.id,
        resource.content,
        async (data) => {
          await ctx.db.businessResource.update({
            where: { id: resource.id },
            data,
          });
        },
      );

      return { success: true };
    }),

  search: protectedProcedure
    .input(
      z.object({
        query: z
          .string()
          .min(1, "La requête est requise")
          .max(500, "La requête ne peut pas dépasser 500 caractères"),
        topK: z
          .number()
          .int()
          .min(1)
          .max(20, "topK ne peut pas dépasser 20")
          .optional()
          .default(5),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const organizationId = await getActiveOrganizationId(ctx.db, userId);

      if (!organizationId) {
        return [];
      }

      const resources = await ctx.db.businessResource.findMany({
        where: {
          organizationId,
          processingStatus: "completed",
        },
      });

      const results: Array<{
        resourceId: string;
        title: string;
        category: string | null;
        matches: Array<{ text: string; similarity: number }>;
      }> = [];

      for (const resource of resources) {
        if (!resource.chunks) continue;

        try {
          const parsedChunks: unknown = JSON.parse(resource.chunks);

          // Validate chunks structure
          if (!Array.isArray(parsedChunks)) {
            console.error(
              `[Resources] Invalid chunks format for resource ${resource.id}: not an array`,
            );
            continue;
          }

          // Validate each chunk
          const chunks: Array<{
            text: string;
            index: number;
            embedding: number[];
          }> = [];

          for (const chunk of parsedChunks) {
            // Type guard for chunk validation
            if (typeof chunk !== "object" || chunk === null) {
              console.error(
                `[Resources] Skipping invalid chunk in resource ${resource.id}`,
              );
              continue;
            }

            const chunkObj = chunk as Record<string, unknown>;

            if (
              typeof chunkObj.text === "string" &&
              typeof chunkObj.index === "number" &&
              Array.isArray(chunkObj.embedding) &&
              chunkObj.embedding.every((n: unknown) => typeof n === "number")
            ) {
              // After validation, we know embedding is number[]
              const validatedEmbedding = chunkObj.embedding.filter(
                (n): n is number => typeof n === "number",
              );

              chunks.push({
                text: chunkObj.text,
                index: chunkObj.index,
                embedding: validatedEmbedding,
              });
            } else {
              console.error(
                `[Resources] Skipping invalid chunk in resource ${resource.id}`,
              );
            }
          }

          if (chunks.length === 0) {
            console.error(
              `[Resources] No valid chunks found for resource ${resource.id}`,
            );
            continue;
          }

          const searchResults = await documentProcessor.semanticSearch(
            input.query,
            chunks,
            input.topK,
          );

          if (searchResults.length > 0) {
            results.push({
              resourceId: resource.id,
              title: resource.title,
              category: resource.category,
              matches: searchResults.map((result) => ({
                text: result.chunk.text,
                similarity: result.similarity,
              })),
            });
          }
        } catch {
          console.error(
            `[Resources] Error processing resource ${resource.id} (corrupted chunks data)`,
          );
          continue;
        }
      }

      results.sort((a, b) => {
        const maxSimA = Math.max(...a.matches.map((m) => m.similarity));
        const maxSimB = Math.max(...b.matches.map((m) => m.similarity));
        return maxSimB - maxSimA;
      });

      return results;
    }),
});
