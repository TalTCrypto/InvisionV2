import { type NextRequest } from "next/server";
import { auth } from "~/server/better-auth";
import { getComposioClient } from "~/server/utils/composio";
import { getCachedConnectedAccounts } from "~/server/utils/composio-cache";
import { extractReelId } from "~/server/utils/instagram-transcript";
import { getInstagramReelTranscriptViaWhisper } from "~/server/utils/instagram-whisper-transcript";
import {
  InstagramReelAnalyzer,
  type ReelAnalysisResult,
} from "~/server/utils/instagram-analyzer";
import {
  getCachedInstagramAnalysis,
  setCachedInstagramAnalysis,
} from "~/server/utils/instagram-cache";
import { env } from "~/env";

export async function GET(req: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: req.headers,
    });

    if (!session?.user?.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const urlOrId = searchParams.get("reelId");
    const language = searchParams.get("language") ?? "fr";
    const forceRefresh = searchParams.get("forceRefresh") === "true";

    if (!urlOrId) {
      return new Response("Missing reelId parameter", { status: 400 });
    }

    const reelId = extractReelId(urlOrId);
    if (!reelId) {
      return new Response("Invalid Instagram URL or Reel ID", { status: 400 });
    }

    // Get organization ID from session (fallback to userId for personal accounts)
    const organizationId =
      session.session?.activeOrganizationId ?? session.user.id;

    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = await getCachedInstagramAnalysis(reelId, organizationId);
      if (cached) {
        console.log(
          `[Instagram Analyze] Returning cached analysis for ${reelId}`,
        );

        // Return cached result as SSE stream
        const stream = new ReadableStream({
          start(controller) {
            const encoder = new TextEncoder();
            const sendSSE = (data: unknown, event?: string) => {
              const eventLine = event ? `event: ${event}\n` : "";
              const dataLine = `data: ${JSON.stringify(data)}\n\n`;
              controller.enqueue(encoder.encode(eventLine + dataLine));
            };

            sendSSE(
              {
                reelId,
                caption: cached.metadata.caption,
                username: cached.metadata.username,
                likeCount: cached.metadata.likeCount,
                commentCount: cached.metadata.commentCount,
                duration: cached.metadata.duration,
                wordCount: cached.transcript.split(/\s+/).length,
                language: cached.language,
                cached: true,
                cachedAt: cached.cachedAt,
              },
              "metadata",
            );

            sendSSE(
              {
                complete: true,
                parsedAnalysis: cached.analysis,
              },
              "analysis",
            );

            setTimeout(() => {
              try {
                controller.close();
              } catch {
                // Ignore
              }
            }, 100);
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      }
    }

    // Get Instagram account
    const composio = getComposioClient();
    const accounts = await getCachedConnectedAccounts(
      composio,
      session.user.id,
    );
    const instagramAccount = accounts.find(
      (acc) =>
        acc.toolkit?.slug?.toLowerCase().replace(/-/g, "") === "instagram" &&
        acc.status === "ACTIVE",
    );

    if (!instagramAccount) {
      return new Response("Instagram account not connected", { status: 401 });
    }

    console.log(
      `[Instagram Analyze] Starting analysis for reel: ${reelId}, user: ${session.user.id}`,
    );

    // Get transcript via Whisper (Instagram doesn't have captions API)
    let transcriptResult;
    try {
      transcriptResult = await getInstagramReelTranscriptViaWhisper(
        urlOrId,
        session.user.id,
        instagramAccount.id,
        composio,
        language,
      );
      console.log(
        `[Instagram Analyze] Transcript obtained: ${transcriptResult.transcript.length} segments`,
      );
    } catch (transcriptError) {
      console.error(
        "[Instagram Analyze] Whisper transcription failed:",
        transcriptError,
      );
      return new Response(
        JSON.stringify({
          error: "Impossible de transcrire ce Reel",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const {
      metadata,
      transcript,
      fullText,
      language: detectedLanguage,
    } = transcriptResult;

    // Calculate word count and duration
    const wordCount = fullText.split(/\s+/).length;
    const reelDurationSeconds = metadata.duration ?? 0;

    // Create SSE stream
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        const sendSSE = (data: unknown, event?: string) => {
          const eventLine = event ? `event: ${event}\n` : "";
          const dataLine = `data: ${JSON.stringify(data)}\n\n`;
          try {
            controller.enqueue(encoder.encode(eventLine + dataLine));
          } catch (error) {
            console.error("[Instagram Analyze] Error sending SSE:", error);
          }
        };

        try {
          // Send metadata event
          sendSSE(
            {
              reelId,
              caption: metadata.caption,
              username: metadata.username,
              likeCount: metadata.likeCount,
              commentCount: metadata.commentCount,
              duration: reelDurationSeconds,
              wordCount,
              transcriptSource: "whisper",
              language: detectedLanguage,
            },
            "metadata",
          );

          // Send initial status
          sendSSE(
            {
              status: "analyzing",
              message: "Initialisation de l'analyse ultra-actionnable...",
            },
            "status",
          );

          // Initialize analyzer
          const analyzer = new InstagramReelAnalyzer(env.OPENAI_API_KEY);

          // Prepare context
          const context = {
            caption: metadata.caption ?? "",
            username: metadata.username ?? "unknown",
            transcript: fullText,
            wordCount,
            language: detectedLanguage ?? language,
            segments: transcript,
            reelDurationSeconds,
          };

          // Stream analysis with callbacks
          const result: ReelAnalysisResult = await analyzer.analyzeReel(
            context,
            (chunk: string) => {
              // Stream token callback
              sendSSE({ chunk }, "token");
            },
            (status: string, message: string) => {
              // Status callback
              sendSSE({ status, message }, "status");
            },
          );

          // Send complete analysis
          sendSSE(
            {
              complete: true,
              parsedAnalysis: result,
            },
            "analysis",
          );

          console.log(
            `[Instagram Analyze] Analysis complete for ${reelId}: score ${result.overallScore}`,
          );

          // Cache the analysis in database
          await setCachedInstagramAnalysis(
            reelId,
            organizationId,
            session.user.id,
            metadata,
            fullText,
            result,
            detectedLanguage,
          );

          // Close stream
          setTimeout(() => {
            try {
              controller.close();
            } catch {
              // Ignore close errors
            }
          }, 200);
        } catch (error) {
          console.error("[Instagram Analyze] Analysis error:", error);
          sendSSE(
            {
              error: "Erreur lors de l'analyse du Reel",
            },
            "error",
          );

          setTimeout(() => {
            try {
              controller.close();
            } catch {
              // Ignore
            }
          }, 200);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("[Instagram Analyze] Route error:", error);
    return new Response(
      JSON.stringify({
        error: "Erreur lors de l'analyse",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
