import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  getYouTubeTranscript,
  extractVideoId,
  formatTranscriptWithTimestamps,
  chunkTranscript,
  type TranscriptResult,
} from "~/server/utils/youtube-transcript";
import { getYouTubeTranscriptViaWhisper } from "~/server/utils/youtube-whisper-transcript";

export const youtubeRouter = createTRPCRouter({
  getVideoInfo: protectedProcedure
    .input(
      z.object({
        urlOrId: z.string().min(1),
      }),
    )
    .query(async ({ input }) => {
      const videoId = extractVideoId(input.urlOrId);

      if (!videoId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "URL ou ID de vidéo YouTube invalide",
        });
      }

      try {
        const result = await getYouTubeTranscript(input.urlOrId);

        return {
          videoId,
          metadata: result.metadata,
          hasTranscript: result.transcript.length > 0,
          transcriptLanguage: result.language,
          transcriptLength: result.fullText.length,
          segmentCount: result.transcript.length,
        };
      } catch (error) {
        if (error instanceof Error && error.message.includes("No captions")) {
          return {
            videoId,
            metadata: { videoId },
            hasTranscript: false,
            transcriptLanguage: null,
            transcriptLength: 0,
            segmentCount: 0,
          };
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Erreur lors de la récupération des informations",
        });
      }
    }),

  getTranscript: protectedProcedure
    .input(
      z.object({
        urlOrId: z.string().min(1),
        language: z.string().optional().default("fr"),
        withTimestamps: z.boolean().optional().default(false),
      }),
    )
    .query(async ({ input }) => {
      const videoId = extractVideoId(input.urlOrId);

      if (!videoId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "URL ou ID de vidéo YouTube invalide",
        });
      }

      let result: TranscriptResult;
      let usedWhisper = false;

      // Try YouTube captions first
      try {
        result = await getYouTubeTranscript(input.urlOrId, input.language);
      } catch (error) {
        console.log(
          "[getTranscript] YouTube captions failed, will try Whisper:",
          error,
        );
        result = { transcript: [], fullText: "", metadata: { videoId } };
      }

      // If YouTube captions are empty, use Whisper fallback
      if (
        !result.transcript ||
        result.transcript.length === 0 ||
        !result.fullText ||
        result.fullText.trim().length === 0
      ) {
        console.log(
          "[getTranscript] Empty transcript, trying Whisper fallback...",
        );
        try {
          result = await getYouTubeTranscriptViaWhisper(
            input.urlOrId,
            input.language,
          );
          usedWhisper = true;
          console.log("[getTranscript] Whisper fallback successful");
        } catch (whisperError) {
          console.error(
            "[getTranscript] Whisper fallback also failed:",
            whisperError,
          );
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message:
              "Impossible de récupérer le transcript (YouTube et Whisper ont échoué)",
          });
        }
      }

      // Final validation
      if (
        !result.transcript ||
        result.transcript.length === 0 ||
        !result.fullText ||
        result.fullText.trim().length === 0
      ) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Le transcript de cette vidéo est vide ou indisponible",
        });
      }

      const formattedText = input.withTimestamps
        ? formatTranscriptWithTimestamps(result.transcript)
        : result.fullText;

      return {
        videoId,
        metadata: result.metadata,
        transcript: formattedText,
        segments: result.transcript,
        language: result.language,
        wordCount: result.fullText.split(/\s+/).length,
        transcriptSource: usedWhisper ? "whisper" : "youtube",
      };
    }),

  prepareAnalysis: protectedProcedure
    .input(
      z.object({
        urlOrId: z.string().min(1),
        language: z.string().optional().default("fr"),
      }),
    )
    .mutation(async ({ input }) => {
      const videoId = extractVideoId(input.urlOrId);

      if (!videoId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "URL ou ID de vidéo YouTube invalide",
        });
      }

      let result: TranscriptResult;

      // Try YouTube captions first
      try {
        result = await getYouTubeTranscript(input.urlOrId, input.language);
      } catch (error) {
        console.log("[prepareAnalysis] YouTube captions failed:", error);
        result = { transcript: [], fullText: "", metadata: { videoId } };
      }

      // Whisper fallback if empty
      if (
        !result.transcript ||
        result.transcript.length === 0 ||
        !result.fullText ||
        result.fullText.trim().length === 0
      ) {
        console.log("[prepareAnalysis] Trying Whisper fallback...");
        try {
          result = await getYouTubeTranscriptViaWhisper(
            input.urlOrId,
            input.language,
          );
        } catch (whisperError) {
          console.error("[prepareAnalysis] Whisper also failed:", whisperError);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message:
              "Impossible de récupérer le transcript (YouTube et Whisper ont échoué)",
          });
        }
      }

      if (!result.transcript || result.transcript.length === 0) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Le transcript est vide ou indisponible",
        });
      }

      const chunks = chunkTranscript(result.transcript, 3000);

      const analysisContext = {
        videoId,
        title: result.metadata.title ?? "Vidéo YouTube",
        channel: result.metadata.channelTitle ?? "Chaîne inconnue",
        description: result.metadata.description ?? "",
        viewCount: result.metadata.viewCount,
        publishedAt: result.metadata.publishedAt,
        transcriptLanguage: result.language,
        totalWords: result.fullText.split(/\s+/).length,
        totalDuration:
          result.transcript.length > 0
            ? Math.ceil(
                (result.transcript[result.transcript.length - 1]?.start ?? 0) +
                  (result.transcript[result.transcript.length - 1]?.duration ??
                    0),
              )
            : 0,
        chunkCount: chunks.length,
      };

      return {
        context: analysisContext,
        transcript: result.fullText,
        chunks,
        metadata: result.metadata,
      };
    }),
});
