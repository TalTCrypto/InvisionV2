import { type NextRequest } from "next/server";
import { auth } from "~/server/better-auth";
import {
  getYouTubeTranscript,
  extractVideoId,
  type TranscriptResult,
} from "~/server/utils/youtube-transcript";
import { getYouTubeTranscriptViaWhisper } from "~/server/utils/youtube-whisper-transcript";
import { YouTubeAnalyzer } from "~/server/utils/youtube-analyzer";
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
    const urlOrId = searchParams.get("videoId");
    const language = searchParams.get("language") ?? "fr";
    const mode = searchParams.get("mode") ?? "multi-step";

    if (!urlOrId) {
      return new Response("Missing videoId parameter", { status: 400 });
    }

    const videoId = extractVideoId(urlOrId);
    if (!videoId) {
      return new Response("Invalid YouTube URL or video ID", { status: 400 });
    }

    let transcriptResult: TranscriptResult;
    let usedWhisper = false;

    // Try YouTube captions first
    try {
      transcriptResult = await getYouTubeTranscript(urlOrId, language);
    } catch (error) {
      console.log("YouTube captions failed, will try Whisper fallback:", error);
      transcriptResult = {
        transcript: [],
        fullText: "",
        metadata: { videoId },
      };
    }

    // If YouTube captions are empty, use Whisper fallback
    if (
      !transcriptResult.transcript ||
      transcriptResult.transcript.length === 0 ||
      !transcriptResult.fullText ||
      transcriptResult.fullText.trim().length === 0
    ) {
      console.log(
        "YouTube analyze: Empty transcript, trying Whisper fallback...",
      );

      try {
        transcriptResult = await getYouTubeTranscriptViaWhisper(
          urlOrId,
          language,
        );
        usedWhisper = true;
        console.log("YouTube analyze: Whisper fallback successful");
      } catch (whisperError) {
        console.error(
          "YouTube analyze: Whisper fallback also failed:",
          whisperError,
        );
        return new Response(
          JSON.stringify({
            error:
              "Impossible de récupérer le transcript de cette vidéo (YouTube et Whisper ont échoué)",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    // Final validation
    if (
      !transcriptResult.transcript ||
      transcriptResult.transcript.length === 0 ||
      !transcriptResult.fullText ||
      transcriptResult.fullText.trim().length === 0
    ) {
      console.error("YouTube analyze: Both methods returned empty transcript");
      return new Response(
        JSON.stringify({
          error: "Le transcript de cette vidéo est vide ou indisponible",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const wordCount = transcriptResult.fullText.split(/\s+/).length;

    // Calculate REAL video duration from transcript segments
    const lastSegment =
      transcriptResult.transcript[transcriptResult.transcript.length - 1];
    const videoDurationSeconds = lastSegment
      ? Math.ceil(lastSegment.start + lastSegment.duration)
      : Math.ceil((wordCount / 150) * 60); // Fallback to estimate

    // Debug logging
    console.log("YouTube analyze:", {
      videoId,
      segmentCount: transcriptResult.transcript.length,
      wordCount,
      videoDurationSeconds,
      usedWhisper,
      transcriptPreview: transcriptResult.fullText.substring(0, 200),
    });

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        const sendSSE = (data: unknown, event?: string) => {
          const eventLine = event ? `event: ${event}\n` : "";
          const dataLine = `data: ${JSON.stringify(data)}\n\n`;
          try {
            controller.enqueue(encoder.encode(eventLine + dataLine));
          } catch (error) {
            console.error("Error sending SSE:", error);
          }
        };

        // Format duration for display
        const formatDuration = (seconds: number) => {
          const mins = Math.floor(seconds / 60);
          const secs = Math.floor(seconds % 60);
          return `${mins}:${secs.toString().padStart(2, "0")}`;
        };

        sendSSE(
          {
            videoId,
            title: transcriptResult.metadata.title,
            channel: transcriptResult.metadata.channelTitle,
            wordCount,
            language: transcriptResult.language,
            duration: formatDuration(videoDurationSeconds),
            durationSeconds: videoDurationSeconds,
            transcriptSource: usedWhisper ? "whisper" : "youtube",
          },
          "metadata",
        );

        sendSSE(
          {
            status: "starting",
            message: "Initialisation de l'analyse LangChain...",
          },
          "status",
        );

        try {
          const analyzer = new YouTubeAnalyzer(env.OPENAI_API_KEY);

          const context = {
            title: transcriptResult.metadata.title ?? "Vidéo YouTube",
            channel:
              transcriptResult.metadata.channelTitle ?? "Chaîne inconnue",
            transcript: transcriptResult.fullText,
            wordCount,
            language: transcriptResult.language ?? "fr",
            segments: transcriptResult.transcript,
            videoDurationSeconds,
          };

          let analysisResult;

          if (mode === "multi-step") {
            analysisResult = await analyzer.analyzeMultiStep(
              context,
              (chunk) => {
                sendSSE({ chunk }, "token");
              },
              (status) => {
                sendSSE({ status: "processing", message: status }, "status");
              },
            );
          } else {
            analysisResult = await analyzer.analyze(context, (chunk) => {
              sendSSE({ chunk }, "token");
            });
          }

          sendSSE(
            {
              complete: true,
              parsedAnalysis: analysisResult,
              metadata: transcriptResult.metadata,
            },
            "analysis",
          );

          setTimeout(() => {
            try {
              controller.close();
            } catch {
              // Ignore close errors
            }
          }, 200);
        } catch (error) {
          console.error("LangChain analysis error:", error);
          sendSSE(
            {
              error: "Erreur lors de l'analyse de la vidéo",
            },
            "error",
          );
          controller.close();
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
    console.error("YouTube analyze endpoint error:", error);
    return new Response(
      JSON.stringify({
        error: "Erreur lors de l'analyse",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
