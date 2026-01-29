import { getSubtitles, getVideoDetails } from "youtube-caption-extractor";

export interface TranscriptSegment {
  text: string;
  start: number;
  duration: number;
}

export interface VideoMetadata {
  videoId: string;
  title?: string;
  description?: string;
  channelTitle?: string;
  publishedAt?: string;
  duration?: string;
  viewCount?: string;
  likeCount?: string;
}

export interface TranscriptResult {
  transcript: TranscriptSegment[];
  fullText: string;
  metadata: VideoMetadata;
  language?: string;
}

export function extractVideoId(urlOrId: string): string | null {
  if (/^[a-zA-Z0-9_-]{11}$/.test(urlOrId)) {
    return urlOrId;
  }

  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(urlOrId);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

export async function getYouTubeTranscript(
  urlOrId: string,
  preferredLanguage = "fr",
): Promise<TranscriptResult> {
  const videoId = extractVideoId(urlOrId);

  if (!videoId) {
    throw new Error("Invalid YouTube URL or video ID");
  }

  try {
    const [subtitlesResult, videoDetailsResult] = await Promise.allSettled([
      getSubtitles({ videoID: videoId, lang: preferredLanguage }),
      getVideoDetails({ videoID: videoId, lang: preferredLanguage }),
    ]);

    let subtitles: Array<{ text: string; start: string; dur: string }> = [];
    let detectedLanguage = preferredLanguage;

    if (subtitlesResult.status === "fulfilled") {
      subtitles = subtitlesResult.value;
    } else {
      const fallbackLangs = ["en", "fr", "es", "de", "it"];
      for (const lang of fallbackLangs) {
        if (lang === preferredLanguage) continue;
        try {
          subtitles = await getSubtitles({ videoID: videoId, lang });
          detectedLanguage = lang;
          break;
        } catch {
          continue;
        }
      }
    }

    if (subtitles.length === 0) {
      throw new Error("No captions available for this video");
    }

    const transcript: TranscriptSegment[] = subtitles.map((sub) => ({
      text: sub.text,
      start: parseFloat(sub.start),
      duration: parseFloat(sub.dur),
    }));

    const fullText = transcript.map((s) => s.text).join(" ");

    let metadata: VideoMetadata = { videoId };

    if (videoDetailsResult.status === "fulfilled") {
      const details = videoDetailsResult.value;
      metadata = {
        videoId,
        title: details.title,
        description: details.description?.substring(0, 500),
      };
    }

    return {
      transcript,
      fullText,
      metadata,
      language: detectedLanguage,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to get YouTube transcript: ${error.message}`);
    }
    throw error;
  }
}

export function formatTranscriptWithTimestamps(
  segments: TranscriptSegment[],
): string {
  return segments
    .map((s) => {
      const minutes = Math.floor(s.start / 60);
      const seconds = Math.floor(s.start % 60);
      const timestamp = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
      return `[${timestamp}] ${s.text}`;
    })
    .join("\n");
}

export function chunkTranscript(
  segments: TranscriptSegment[],
  maxChunkSize = 2000,
): Array<{ text: string; startTime: number; endTime: number }> {
  const chunks: Array<{ text: string; startTime: number; endTime: number }> =
    [];
  let currentChunk = "";
  let chunkStartTime = 0;
  let chunkEndTime = 0;

  for (const segment of segments) {
    if (currentChunk.length === 0) {
      chunkStartTime = segment.start;
    }

    if (
      currentChunk.length + segment.text.length > maxChunkSize &&
      currentChunk.length > 0
    ) {
      chunks.push({
        text: currentChunk.trim(),
        startTime: chunkStartTime,
        endTime: chunkEndTime,
      });
      currentChunk = segment.text;
      chunkStartTime = segment.start;
    } else {
      currentChunk += (currentChunk ? " " : "") + segment.text;
    }

    chunkEndTime = segment.start + segment.duration;
  }

  if (currentChunk.trim()) {
    chunks.push({
      text: currentChunk.trim(),
      startTime: chunkStartTime,
      endTime: chunkEndTime,
    });
  }

  return chunks;
}
