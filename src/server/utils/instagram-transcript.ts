/**
 * Instagram Reel Transcript Utilities
 * Handles Reel ID extraction, metadata fetching via Composio, and video download
 */

import type { Composio } from "@composio/core";
import type { TranscriptSegment } from "./youtube-transcript";

export interface ReelMetadata {
  reelId: string;
  caption?: string;
  username?: string;
  likeCount?: number;
  commentCount?: number;
  playCount?: number;
  timestamp?: string;
  duration?: number;
  mediaType?: string;
  permalink?: string;
}

export interface ReelTranscriptResult {
  transcript: TranscriptSegment[];
  fullText: string;
  metadata: ReelMetadata;
  language?: string;
  transcriptSource: "whisper";
}

/**
 * Extract Instagram Reel/Post ID (shortcode) from URL or direct ID
 * Supports formats:
 * - https://www.instagram.com/reel/ABC123xyz/
 * - https://www.instagram.com/p/ABC123xyz/
 * - https://instagram.com/reels/ABC123xyz/
 * - ABC123xyz (direct shortcode)
 */
export function extractReelId(urlOrId: string): string | null {
  if (!urlOrId) return null;

  const trimmed = urlOrId.trim();

  // Pattern 1: instagram.com/reel/CODE or instagram.com/p/CODE
  const reelPattern = /(?:instagram\.com\/(?:reel|p|reels)\/)([\w-]+)/i;
  const reelMatch = reelPattern.exec(trimmed);
  if (reelMatch?.[1]) {
    return reelMatch[1];
  }

  // Pattern 2: Direct shortcode (usually 11 chars but can vary)
  // Instagram shortcodes are alphanumeric + underscore/dash, typically 11 chars
  const directPattern = /^([\w-]{8,12})$/;
  const directMatch = directPattern.exec(trimmed);
  if (directMatch?.[1]) {
    return directMatch[1];
  }

  return null;
}

/**
 * Get Instagram Reel metadata via Composio
 * Uses INSTAGRAM_GET_USER_MEDIA to fetch media details
 */
export async function getInstagramReelMetadata(
  reelId: string,
  userId: string,
  accountId: string,
  composio: Composio,
  version?: string,
): Promise<ReelMetadata> {
  try {
    console.log(`[Instagram] Fetching metadata for reel: ${reelId}`);

    // Try to get specific media by ID
    // Note: Instagram Graph API might require iterating through media to find by shortcode
    // For now, we'll try to get user media and find the matching one
    // In production, you might need INSTAGRAM_GET_MEDIA_BY_ID if available

    const result = await composio.tools.execute("INSTAGRAM_GET_USER_MEDIA", {
      userId,
      connectedAccountId: accountId,
      version: version ?? "latest",
      dangerouslySkipVersionCheck: !version,
      arguments: {
        ig_user_id: "me",
        limit: 50, // Get recent media to find our reel
      },
    });

    if (!result.successful || !result.data) {
      throw new Error("Failed to fetch Instagram media");
    }

    // Parse response to find matching reel
    const mediaData = result.data as {
      data?: Array<{
        id: string;
        caption?: string;
        media_type?: string;
        like_count?: number;
        comments_count?: number;
        timestamp?: string;
        permalink?: string;
        username?: string;
      }>;
    };

    // Try to find the reel by permalink containing the shortcode
    const media = mediaData.data?.find((item) =>
      item.permalink?.includes(reelId),
    );

    if (media) {
      console.log(
        `[Instagram] Found reel ${reelId} in connected account - using Composio metadata`,
      );
      return buildMetadataFromMedia(reelId, media);
    }

    // Reel not found in user's media (probably from another account) - this is normal
    console.log(
      `[Instagram] Reel ${reelId} from external account - will use yt-dlp metadata`,
    );
    return { reelId }; // Return minimal metadata, yt-dlp will fill the rest
  } catch (error) {
    console.log(
      `[Instagram] Composio unavailable - will use yt-dlp metadata instead`,
    );
    return { reelId }; // Return minimal metadata, yt-dlp will fill the rest
  }
}

function buildMetadataFromMedia(
  reelId: string,
  media: {
    id?: string;
    caption?: string;
    media_type?: string;
    like_count?: number;
    comments_count?: number;
    timestamp?: string;
    permalink?: string;
    username?: string;
  },
): ReelMetadata {
  return {
    reelId,
    caption: media.caption,
    username: media.username,
    likeCount: media.like_count,
    commentCount: media.comments_count,
    timestamp: media.timestamp,
    mediaType: media.media_type,
    permalink: media.permalink,
    // Duration will be filled by Whisper transcription
  };
}
