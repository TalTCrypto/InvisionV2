import { type NextRequest } from "next/server";
import { auth } from "~/server/better-auth";
import { db } from "~/server/db";
import { AgentFactory, SSEStream } from "~/server/services/langchain-agents";
import { documentProcessor } from "~/server/services/langchain-processor";
import { InstagramReelAnalyzer } from "~/server/utils/instagram-analyzer";
import { YouTubeAnalyzer } from "~/server/utils/youtube-analyzer";
import { getComposioClient } from "~/server/utils/composio";
import { env } from "~/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getActiveOrganizationId(
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

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user?.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("sessionId");
    const message = searchParams.get("message");
    const agentType = searchParams.get("agent") ?? "orchestrator";

    if (!sessionId || !message) {
      return new Response("Missing sessionId or message", { status: 400 });
    }

    const chatSession = await db.chatSession.findUnique({
      where: { id: sessionId },
      select: { userId: true, organizationId: true },
    });

    if (!chatSession) {
      return new Response("Session not found", { status: 404 });
    }

    if (chatSession.userId !== session.user.id) {
      return new Response("Forbidden", { status: 403 });
    }

    const organizationId =
      chatSession.organizationId ??
      (await getActiveOrganizationId(session.user.id));

    if (!organizationId) {
      return new Response("No organization found", { status: 400 });
    }

    const factory = new AgentFactory({
      db,
      documentProcessor,
      instagramAnalyzer: new InstagramReelAnalyzer(env.OPENAI_API_KEY),
      youtubeAnalyzer: new YouTubeAnalyzer(env.OPENAI_API_KEY),
      composioClient: getComposioClient(),
    });

    const validAgentTypes = ["orchestrator", "content", "performance", "strategy"];
    const resolvedAgentType = validAgentTypes.includes(agentType)
      ? agentType
      : "orchestrator";

    const agent = await factory.createAgent(
      resolvedAgentType as "orchestrator" | "content" | "performance" | "strategy",
      { sessionId },
    );

    const streamGenerator = agent.stream(message, {
      sessionId,
      organizationId,
      userId: session.user.id,
    });

    const stream = SSEStream.createStream(streamGenerator);

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    console.error("[ChatV2Stream] Error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
