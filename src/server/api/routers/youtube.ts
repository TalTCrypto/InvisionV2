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

      try {
        const result = await getYouTubeTranscript(
          input.urlOrId,
          input.language,
        );

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
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Erreur lors de la récupération du transcript",
        });
      }
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
      try {
        result = await getYouTubeTranscript(input.urlOrId, input.language);
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Erreur lors de la récupération du transcript",
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
