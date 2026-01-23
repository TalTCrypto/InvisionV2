/**
 * YouTube Transcript Fetcher
 * Récupère le transcript d'une vidéo YouTube
 */

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

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

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

async function fetchVideoPage(videoId: string): Promise<string> {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept-Language": "en-US,en;q=0.9,fr;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch video page: ${response.status}`);
  }

  return response.text();
}

function extractCaptionTracks(
  html: string,
): Array<{ baseUrl: string; languageCode: string; name: string }> {
  // Try multiple patterns as YouTube changes their format
  const patterns = [
    /"captionTracks":\s*(\[[\s\S]*?\])(?=\s*,\s*")/,
    /"captionTracks":\s*(\[[\s\S]*?\])\s*,/,
    /captionTracks\\?":\s*(\[[\s\S]*?\])/,
  ];

  let captionData: string | null = null;

  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match?.[1]) {
      captionData = match[1];
      break;
    }
  }

  if (!captionData) {
    return [];
  }

  try {
    // Handle escaped JSON
    const cleanedData = captionData
      .replace(/\\"/g, '"')
      .replace(/\\u0026/g, "&")
      .replace(/\\\\/g, "\\");

    const tracks = JSON.parse(cleanedData) as Array<{
      baseUrl: string;
      languageCode: string;
      name?: { simpleText?: string };
      vssId?: string;
    }>;

    return tracks.map((track) => ({
      baseUrl: track.baseUrl.replace(/\\u0026/g, "&"),
      languageCode: track.languageCode,
      name: track.name?.simpleText ?? track.languageCode,
    }));
  } catch (error) {
    console.error("Failed to parse caption tracks:", error);
    return [];
  }
}

function extractVideoMetadata(html: string, videoId: string): VideoMetadata {
  const metadata: VideoMetadata = { videoId };

  const titleMatch = /"title":"([^"]+)"/.exec(html);
  if (titleMatch?.[1]) {
    metadata.title = titleMatch[1].replace(/\\u0026/g, "&");
  }

  const channelMatch = /"ownerChannelName":"([^"]+)"/.exec(html);
  if (channelMatch?.[1]) {
    metadata.channelTitle = channelMatch[1];
  }

  const viewMatch = /"viewCount":"(\d+)"/.exec(html);
  if (viewMatch?.[1]) {
    metadata.viewCount = viewMatch[1];
  }

  const dateMatch = /"publishDate":"([^"]+)"/.exec(html);
  if (dateMatch?.[1]) {
    metadata.publishedAt = dateMatch[1];
  }

  const descMatch = /"shortDescription":"([^"]*)"/.exec(html);
  if (descMatch?.[1]) {
    metadata.description = descMatch[1]
      .replace(/\\n/g, "\n")
      .replace(/\\u0026/g, "&")
      .substring(0, 500);
  }

  return metadata;
}

async function fetchTranscriptXml(
  baseUrl: string,
): Promise<TranscriptSegment[]> {
  const response = await fetch(baseUrl, {
    headers: {
      "User-Agent": USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch transcript: ${response.status}`);
  }

  const xml = await response.text();
  const segments: TranscriptSegment[] = [];

  // Try multiple regex patterns to handle different YouTube transcript formats
  // Pattern 1: Standard format with dur attribute
  const textRegex1 =
    /<text start="([\d.]+)" dur="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g;
  // Pattern 2: Format without dur attribute
  const textRegex2 = /<text start="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g;

  let match;
  let lastStart = 0;

  // Try pattern 1 first
  while ((match = textRegex1.exec(xml)) !== null) {
    const start = parseFloat(match[1] ?? "0");
    const duration = parseFloat(match[2] ?? "0");
    const text = decodeTranscriptText(match[3] ?? "");

    if (text) {
      segments.push({ text, start, duration });
      lastStart = start;
    }
  }

  // If no segments found, try pattern 2
  if (segments.length === 0) {
    while ((match = textRegex2.exec(xml)) !== null) {
      const start = parseFloat(match[1] ?? "0");
      const text = decodeTranscriptText(match[2] ?? "");
      // Estimate duration as 3 seconds if not provided
      const duration = 3;

      if (text) {
        segments.push({ text, start, duration });
      }
    }
  }

  return segments;
}

function decodeTranscriptText(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCharCode(parseInt(code, 10)),
    )
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function getYouTubeTranscript(
  urlOrId: string,
  preferredLanguage = "fr",
): Promise<TranscriptResult> {
  const videoId = extractVideoId(urlOrId);

  if (!videoId) {
    throw new Error("Invalid YouTube URL or video ID");
  }

  const html = await fetchVideoPage(videoId);
  const metadata = extractVideoMetadata(html, videoId);
  const captionTracks = extractCaptionTracks(html);

  if (captionTracks.length === 0) {
    throw new Error("No captions available for this video");
  }

  let selectedTrack = captionTracks.find(
    (t) => t.languageCode === preferredLanguage,
  );

  selectedTrack ??= captionTracks.find((t) => t.languageCode.startsWith("en"));

  selectedTrack ??= captionTracks[0];

  if (!selectedTrack) {
    throw new Error("No suitable caption track found");
  }

  const transcript = await fetchTranscriptXml(selectedTrack.baseUrl);

  const fullText = transcript.map((s) => s.text).join(" ");

  return {
    transcript,
    fullText,
    metadata,
    language: selectedTrack.languageCode,
  };
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
