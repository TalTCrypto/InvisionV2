/**
 * Instagram tRPC Router
 * Handles Reel metadata fetching and transcript generation
 */

import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { getComposioClient } from "~/server/utils/composio";
import { getCachedConnectedAccounts } from "~/server/utils/composio-cache";
import {
  extractReelId,
  getInstagramReelMetadata,
  type ReelMetadata,
} from "~/server/utils/instagram-transcript";
import { getInstagramReelTranscriptViaWhisper } from "~/server/utils/instagram-whisper-transcript";

/**
 * Get Instagram connected account for user
 */
async function getInstagramAccount(userId: string) {
  const composio = getComposioClient();
  const accounts = await getCachedConnectedAccounts(composio, userId);

  const instagramAccount = accounts.find(
    (acc) =>
      acc.toolkit?.slug?.toLowerCase().replace(/-/g, "") === "instagram" &&
      acc.status === "ACTIVE",
  );

  if (!instagramAccount) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message:
        "Instagram non connecté. Veuillez connecter votre compte Instagram dans les intégrations.",
    });
  }

  return instagramAccount;
}

export const instagramRouter = createTRPCRouter({
  /**
   * Get Instagram Reel metadata
   * Validates URL and returns basic reel information
   */
  getReelInfo: protectedProcedure
    .input(
      z.object({
        urlOrId: z.string().min(1, "L'URL ou ID du Reel est requis"),
      }),
    )
    .query(async ({ input, ctx }) => {
      try {
        const reelId = extractReelId(input.urlOrId);

        if (!reelId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "URL Instagram invalide. Formats acceptés: instagram.com/reel/ABC123, instagram.com/p/ABC123, ou code direct ABC123",
          });
        }

        const account = await getInstagramAccount(ctx.session.user.id);
        const composio = getComposioClient();

        // Get metadata
        const metadata = await getInstagramReelMetadata(
          reelId,
          ctx.session.user.id,
          account.id,
          composio,
        );

        console.log(`[Instagram] Reel info retrieved: ${reelId}`);

        return {
          reelId,
          metadata,
          hasMetadata: true,
        };
      } catch (error) {
        console.error("[Instagram] getReelInfo error:", error);

        if (error instanceof TRPCError) {
          throw error;
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Impossible de récupérer les informations du Reel: ${error instanceof Error ? error.message : "Erreur inconnue"}`,
        });
      }
    }),

  /**
   * Get Instagram Reel transcript via Whisper
   * Note: Instagram doesn't provide captions API, so Whisper is mandatory
   */
  getReelTranscript: protectedProcedure
    .input(
      z.object({
        urlOrId: z.string().min(1, "L'URL ou ID du Reel est requis"),
        language: z.string().optional().default("fr"),
        withTimestamps: z.boolean().optional().default(false),
      }),
    )
    .query(async ({ input, ctx }) => {
      try {
        const reelId = extractReelId(input.urlOrId);

        if (!reelId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "URL Instagram invalide",
          });
        }

        const account = await getInstagramAccount(ctx.session.user.id);
        const composio = getComposioClient();

        console.log(
          `[Instagram] Starting transcript for ${reelId} (lang: ${input.language})`,
        );

        // Get transcript via Whisper (only option for Instagram)
        const result = await getInstagramReelTranscriptViaWhisper(
          input.urlOrId,
          ctx.session.user.id,
          account.id,
          composio,
          input.language,
        );

        // Format transcript
        let formattedTranscript = result.fullText;
        if (input.withTimestamps && result.transcript.length > 0) {
          formattedTranscript = result.transcript
            .map((seg) => {
              const mins = Math.floor(seg.start / 60);
              const secs = Math.floor(seg.start % 60);
              const timestamp = `${mins}:${secs.toString().padStart(2, "0")}`;
              return `[${timestamp}] ${seg.text}`;
            })
            .join("\n");
        }

        const wordCount = result.fullText.split(/\s+/).length;
        const segmentCount = result.transcript.length;

        console.log(
          `[Instagram] Transcript complete: ${reelId}, ${wordCount} words, ${segmentCount} segments`,
        );

        return {
          reelId,
          metadata: result.metadata,
          transcript: formattedTranscript,
          segments: result.transcript,
          fullText: result.fullText,
          language: result.language ?? input.language,
          wordCount,
          segmentCount,
          transcriptSource: "whisper" as const,
        };
      } catch (error) {
        console.error("[Instagram] getReelTranscript error:", error);

        if (error instanceof TRPCError) {
          throw error;
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Impossible de transcrire le Reel: ${error instanceof Error ? error.message : "Erreur inconnue"}`,
        });
      }
    }),

  /**
   * Prepare analysis context (optional - for future batch analysis)
   */
  prepareAnalysis: protectedProcedure
    .input(
      z.object({
        urlOrId: z.string().min(1),
        language: z.string().optional().default("fr"),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const reelId = extractReelId(input.urlOrId);

        if (!reelId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "URL Instagram invalide",
          });
        }

        const account = await getInstagramAccount(ctx.session.user.id);
        const composio = getComposioClient();

        const result = await getInstagramReelTranscriptViaWhisper(
          input.urlOrId,
          ctx.session.user.id,
          account.id,
          composio,
          input.language,
        );

        const wordCount = result.fullText.split(/\s+/).length;

        return {
          reelId,
          metadata: result.metadata,
          context: {
            caption: result.metadata.caption ?? "",
            username: result.metadata.username ?? "unknown",
            transcript: result.fullText,
            wordCount,
            language: result.language ?? input.language,
            segments: result.transcript,
            reelDurationSeconds: result.metadata.duration ?? 0,
          },
        };
      } catch (error) {
        console.error("[Instagram] prepareAnalysis error:", error);

        if (error instanceof TRPCError) {
          throw error;
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Impossible de préparer l'analyse: ${error instanceof Error ? error.message : "Erreur inconnue"}`,
        });
      }
    }),
});
