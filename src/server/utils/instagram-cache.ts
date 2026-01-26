/**
 * Instagram Analysis Database Caching
 * Replaces localStorage with server-side database caching
 */

import { db } from "~/server/db";
import type { ReelMetadata } from "./instagram-transcript";

export interface CachedInstagramAnalysis {
  metadata: ReelMetadata;
  transcript: string;
  analysis: unknown;
  language?: string;
  cachedAt: number;
}

const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Get cached Instagram analysis from database
 */
export async function getCachedInstagramAnalysis(
  reelId: string,
  organizationId: string,
): Promise<CachedInstagramAnalysis | null> {
  try {
    const cached = await db.instagramAnalysis.findUnique({
      where: {
        reelId_organizationId: {
          reelId,
          organizationId,
        },
      },
    });

    if (!cached) {
      return null;
    }

    // Check if cache is expired
    const now = new Date();
    if (cached.expiresAt < now) {
      // Delete expired cache
      await db.instagramAnalysis.delete({
        where: {
          id: cached.id,
        },
      });
      return null;
    }

    // Parse JSON fields
    return {
      metadata: JSON.parse(cached.metadata) as ReelMetadata,
      transcript: cached.transcript,
      analysis: JSON.parse(cached.analysis),
      language: cached.language ?? undefined,
      cachedAt: cached.createdAt.getTime(),
    };
  } catch (error) {
    console.error("[Instagram-Cache] Failed to get cached analysis:", error);
    return null;
  }
}

/**
 * Save Instagram analysis to database cache
 */
export async function setCachedInstagramAnalysis(
  reelId: string,
  organizationId: string,
  userId: string,
  metadata: ReelMetadata,
  transcript: string,
  analysis: unknown,
  language?: string,
): Promise<void> {
  try {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + CACHE_DURATION_MS);

    await db.instagramAnalysis.upsert({
      where: {
        reelId_organizationId: {
          reelId,
          organizationId,
        },
      },
      create: {
        reelId,
        organizationId,
        userId,
        metadata: JSON.stringify(metadata),
        transcript,
        analysis: JSON.stringify(analysis),
        language,
        expiresAt,
      },
      update: {
        userId,
        metadata: JSON.stringify(metadata),
        transcript,
        analysis: JSON.stringify(analysis),
        language,
        expiresAt,
        updatedAt: now,
      },
    });

    console.log(`[Instagram-Cache] Cached analysis for ${reelId}`);
  } catch (error) {
    console.error("[Instagram-Cache] Failed to cache analysis:", error);
  }
}

/**
 * Delete cached analysis (invalidate cache)
 */
export async function deleteCachedInstagramAnalysis(
  reelId: string,
  organizationId: string,
): Promise<void> {
  try {
    await db.instagramAnalysis.delete({
      where: {
        reelId_organizationId: {
          reelId,
          organizationId,
        },
      },
    });
    console.log(`[Instagram-Cache] Deleted cache for ${reelId}`);
  } catch (error) {
    console.error("[Instagram-Cache] Failed to delete cache:", error);
  }
}

/**
 * Clean up expired cache entries (run periodically)
 */
export async function cleanupExpiredInstagramCache(): Promise<void> {
  try {
    const result = await db.instagramAnalysis.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });
    console.log(`[Instagram-Cache] Cleaned up ${result.count} expired entries`);
  } catch (error) {
    console.error("[Instagram-Cache] Failed to cleanup expired cache:", error);
  }
}
