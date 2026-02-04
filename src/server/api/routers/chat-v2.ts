import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { AgentFactory } from "~/server/services/langchain-agents";
import { documentProcessor } from "~/server/services/langchain-processor";
import { InstagramReelAnalyzer } from "~/server/utils/instagram-analyzer";
import { YouTubeAnalyzer } from "~/server/utils/youtube-analyzer";
import { getComposioClient } from "~/server/utils/composio";
import { env } from "~/env";
import type { PrismaClient } from "../../../../generated/prisma";

async function getActiveOrganizationId(
  db: PrismaClient,
  userId: string,
): Promise<string | null> {
  const session = await db.session.findFirst({
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

  const firstMember = await db.member.findFirst({
    where: { userId },
    orderBy: {
      createdAt: "desc",
    },
  });

  return firstMember?.organizationId ?? null;
}

export const chatV2Router = createTRPCRouter({
  sendMessage: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
        message: z.string().min(1).max(10000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const chatSession = await ctx.db.chatSession.findUnique({
        where: { id: input.sessionId },
        select: { userId: true, organizationId: true },
      });

      if (!chatSession) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Session non trouvée",
        });
      }

      if (chatSession.userId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Accès interdit" });
      }

      const organizationId =
        chatSession.organizationId ??
        (await getActiveOrganizationId(ctx.db, ctx.session.user.id));

      if (!organizationId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Aucune organisation trouvée",
        });
      }

      const factory = new AgentFactory({
        db: ctx.db,
        documentProcessor,
        instagramAnalyzer: new InstagramReelAnalyzer(env.OPENAI_API_KEY),
        youtubeAnalyzer: new YouTubeAnalyzer(env.OPENAI_API_KEY),
        composioClient: getComposioClient(),
      });

      const agent = await factory.createAgent("orchestrator", {
        sessionId: input.sessionId,
      });

      const response = await agent.execute(input.message, {
        sessionId: input.sessionId,
        organizationId,
        userId: ctx.session.user.id,
      });

      return {
        success: true,
        message: response.output,
        duration: response.duration,
        tokensUsed: response.tokensUsed,
        streaming: true,
      };
    }),

  testAgent: protectedProcedure
    .input(
      z.object({
        message: z.string().min(1).max(1000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const organizationId = await getActiveOrganizationId(
        ctx.db,
        ctx.session.user.id,
      );

      if (!organizationId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Aucune organisation trouvée",
        });
      }

      const sessionId = "test_session_" + ctx.session.user.id;

      const existingSession = await ctx.db.chatSession.findFirst({
        where: {
          id: sessionId,
        },
      });

      if (!existingSession) {
        await ctx.db.chatSession.create({
          data: {
            id: sessionId,
            userId: ctx.session.user.id,
            organizationId,
            title: "Test Agent V2",
            messages: JSON.stringify([]),
          },
        });
      }

      const factory = new AgentFactory({
        db: ctx.db,
        documentProcessor,
        instagramAnalyzer: new InstagramReelAnalyzer(env.OPENAI_API_KEY),
        youtubeAnalyzer: new YouTubeAnalyzer(env.OPENAI_API_KEY),
        composioClient: getComposioClient(),
      });

      const agent = await factory.createAgent("orchestrator", {
        sessionId,
      });

      const response = await agent.execute(input.message, {
        sessionId,
        organizationId,
        userId: ctx.session.user.id,
      });

      return {
        success: true,
        output: response.output,
        duration: response.duration,
        reasoning: response.reasoning,
        toolsUsed: response.toolsUsed,
      };
    }),

  createSession: protectedProcedure
    .input(z.object({ title: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const organizationId = await getActiveOrganizationId(ctx.db, userId);

      if (!organizationId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Aucune organisation trouvée",
        });
      }

      const session = await ctx.db.chatSession.create({
        data: {
          userId,
          organizationId,
          title: input.title ?? "Nouvelle conversation",
          messages: "[]",
        },
      });

      return { id: session.id, title: session.title };
    }),

  getSessions: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const organizationId = await getActiveOrganizationId(ctx.db, userId);

    if (!organizationId) return [];

    const sessions = await ctx.db.chatSession.findMany({
      where: { userId, organizationId },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });

    return sessions.map((s) => ({
      id: s.id,
      title: s.title,
      messageCount: (JSON.parse(s.messages ?? "[]") as unknown[]).length,
      updatedAt: s.updatedAt,
    }));
  }),

  getSession: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const session = await ctx.db.chatSession.findFirst({
        where: { id: input.sessionId, userId: ctx.session.user.id },
      });

      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Session non trouvée",
        });
      }

      const messages = JSON.parse(session.messages ?? "[]") as Array<{
        role: "user" | "assistant";
        content: string;
        timestamp: string;
      }>;

      return { id: session.id, title: session.title, messages };
    }),

  deleteSession: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.db.chatSession.findFirst({
        where: { id: input.sessionId, userId: ctx.session.user.id },
      });

      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Session non trouvée",
        });
      }

      await ctx.db.chatSession.delete({ where: { id: input.sessionId } });
      return { success: true };
    }),
});
