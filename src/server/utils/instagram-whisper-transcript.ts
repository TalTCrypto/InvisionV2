/**
 * Instagram Reel Whisper Transcription
 * Downloads Reel video and transcribes with OpenAI Whisper API
 * Adapted from youtube-whisper-transcript.ts for Instagram
 */

import { spawn } from "child_process";
import { readFile, readdir, rm, mkdtemp } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { env } from "~/env";
import type { Composio } from "@composio/core";
import type { TranscriptSegment } from "./youtube-transcript";
import {
  extractReelId,
  getInstagramReelMetadata,
  type ReelTranscriptResult,
  type ReelMetadata,
} from "./instagram-transcript";

interface WhisperSegment {
  id: number;
  seek: number;
  start: number;
  end: number;
  text: string;
  tokens: number[];
  temperature: number;
  avg_logprob: number;
  compression_ratio: number;
  no_speech_prob: number;
}

interface WhisperResponse {
  task: string;
  language: string;
  duration: number;
  text: string;
  segments?: WhisperSegment[];
}

/**
 * Execute yt-dlp command with timeout
 */
async function executeYtDlp(
  args: string[],
  timeoutMs = 120000,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const ytdlp = spawn("yt-dlp", args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let killed = false;

    const timeout = setTimeout(() => {
      killed = true;
      ytdlp.kill("SIGTERM");
      reject(new Error("yt-dlp timeout after " + timeoutMs + "ms"));
    }, timeoutMs);

    ytdlp.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    ytdlp.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    ytdlp.on("close", (code) => {
      clearTimeout(timeout);
      if (killed) return;

      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`yt-dlp exit code ${code}: ${stderr}`));
      }
    });

    ytdlp.on("error", (err) => {
      clearTimeout(timeout);
      reject(new Error(`Failed to spawn yt-dlp: ${err.message}`));
    });
  });
}

/**
 * Download Instagram Reel video
 * Note: Instagram downloads may require cookies for authentication
 */
async function downloadReelVideo(reelId: string): Promise<{
  buffer: Buffer;
  metadata: Partial<ReelMetadata>;
  cleanup: () => Promise<void>;
}> {
  // SECURITY: Strict validation to prevent command injection
  if (!/^[\w-]{8,12}$/.test(reelId)) {
    throw new Error("Invalid reel ID format");
  }

  const url = `https://www.instagram.com/reel/${reelId}/`;
  const requestId = randomUUID().slice(0, 8);

  // SECURITY: Sanitize reelId before using in path
  const sanitizedId = reelId.replace(/[^a-zA-Z0-9_-]/g, "");
  const tempDir = await mkdtemp(
    join(tmpdir(), `ig-whisper-${requestId}-${sanitizedId}-`),
  );

  const cleanup = async () => {
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  };

  try {
    console.log(`[Instagram-Whisper:${requestId}] Downloading reel ${reelId}`);

    // Try downloading with yt-dlp without browser cookies (cloud compatible)
    await executeYtDlp([
      "-f",
      "best[ext=mp4]/best",
      "--no-playlist",
      "--no-warnings",
      "--write-info-json",
      "-o",
      join(tempDir, "%(id)s.%(ext)s"),
      url,
    ]);

    const files = await readdir(tempDir);
    const videoFile = files.find(
      (f) =>
        !f.endsWith(".json") &&
        (f.endsWith(".mp4") ||
          f.endsWith(".webm") ||
          f.endsWith(".mkv") ||
          f.endsWith(".m4a")),
    );

    if (!videoFile) {
      throw new Error("Video file not found after download");
    }

    const videoPath = join(tempDir, videoFile);

    // Read metadata from info.json
    const infoFile = files.find((f) => f.endsWith(".info.json"));
    let metadata: Partial<ReelMetadata> = { reelId };

    if (infoFile) {
      try {
        const infoContent = await readFile(join(tempDir, infoFile), "utf-8");
        const info = JSON.parse(infoContent) as {
          id?: string;
          title?: string;
          description?: string;
          uploader?: string;
          duration?: number;
          view_count?: number;
          like_count?: number;
          comment_count?: number;
        };

        metadata = {
          reelId,
          caption: info.description ?? info.title,
          username: info.uploader,
          duration: info.duration,
          likeCount: info.like_count,
          commentCount: info.comment_count,
          playCount: info.view_count,
        };
      } catch {
        console.log(
          `[Instagram-Whisper:${requestId}] Could not parse metadata`,
        );
      }
    }

    // Read video file
    const buffer = await readFile(videoPath);
    const sizeMB = buffer.length / 1024 / 1024;

    // SECURITY: Enforce file size limit (Whisper API max is 25MB)
    const MAX_VIDEO_SIZE_MB = 25;
    if (sizeMB > MAX_VIDEO_SIZE_MB) {
      await cleanup();
      throw new Error(
        `Video too large: ${sizeMB.toFixed(2)}MB (max ${MAX_VIDEO_SIZE_MB}MB)`,
      );
    }

    console.log(
      `[Instagram-Whisper:${requestId}] Downloaded ${sizeMB.toFixed(2)} MB`,
    );

    return { buffer, metadata, cleanup };
  } catch (error) {
    await cleanup();
    console.error(`[Instagram-Whisper:${requestId}] Download failed:`, error);
    throw new Error(
      `Failed to download Instagram Reel: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Get audio MIME type from buffer magic bytes
 */
function getAudioMimeType(buffer: Buffer): {
  mimeType: string;
  extension: string;
} {
  const header = buffer.slice(0, 12);

  // M4A/MP4 (ftyp)
  if (header.slice(4, 8).toString() === "ftyp") {
    return { mimeType: "audio/mp4", extension: "m4a" };
  }

  // WebM
  if (header.slice(0, 4).toString("hex") === "1a45dfa3") {
    return { mimeType: "audio/webm", extension: "webm" };
  }

  // Ogg
  if (header.slice(0, 4).toString() === "OggS") {
    return { mimeType: "audio/ogg", extension: "ogg" };
  }

  // MP3 (ID3 or sync)
  if (
    header.slice(0, 3).toString() === "ID3" ||
    (header[0] === 0xff &&
      header[1] !== undefined &&
      (header[1] & 0xe0) === 0xe0)
  ) {
    return { mimeType: "audio/mpeg", extension: "mp3" };
  }

  // Default to MP4
  return { mimeType: "audio/mp4", extension: "m4a" };
}

/**
 * Transcribe audio with OpenAI Whisper API
 */
async function transcribeWithWhisper(
  audioBuffer: Buffer,
  language?: string,
  requestId?: string,
): Promise<WhisperResponse> {
  const id = requestId ?? "unknown";
  console.log(
    `[Instagram-Whisper:${id}] Transcribing ${(audioBuffer.length / 1024 / 1024).toFixed(2)} MB...`,
  );

  const { mimeType, extension } = getAudioMimeType(audioBuffer);
  const formData = new FormData();

  const uint8Array = new Uint8Array(audioBuffer);
  const audioBlob = new Blob([uint8Array], { type: mimeType });
  formData.append("file", audioBlob, `audio.${extension}`);
  formData.append("model", "whisper-1");
  formData.append("response_format", "verbose_json");

  if (language) {
    formData.append("language", language);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 300000);

  try {
    const response = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: formData,
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Whisper API error ${response.status}: ${error}`);
    }

    const result = (await response.json()) as WhisperResponse;
    console.log(
      `[Instagram-Whisper:${id}] Transcription complete: ${result.segments?.length ?? 0} segments`,
    );
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Convert Whisper segments to TranscriptSegment format
 */
function convertWhisperSegments(
  segments: WhisperSegment[],
): TranscriptSegment[] {
  return segments.map((seg) => ({
    text: seg.text.trim(),
    start: seg.start,
    duration: seg.end - seg.start,
  }));
}

/**
 * Get Instagram Reel transcript via Whisper
 * Main entry point for Instagram Reel transcription
 */
export async function getInstagramReelTranscriptViaWhisper(
  urlOrId: string,
  userId: string,
  accountId: string,
  composio: Composio,
  preferredLanguage = "fr",
  version?: string,
): Promise<ReelTranscriptResult> {
  const reelId = extractReelId(urlOrId);

  if (!reelId) {
    throw new Error("Invalid Instagram URL or Reel ID");
  }

  const requestId = randomUUID().slice(0, 8);
  console.log(
    `[Instagram-Whisper:${requestId}] Starting transcript for ${reelId}`,
  );

  // First, get metadata from Composio
  let composioMetadata: ReelMetadata;
  try {
    composioMetadata = await getInstagramReelMetadata(
      reelId,
      userId,
      accountId,
      composio,
      version,
    );
    console.log(`[Instagram-Whisper:${requestId}] Got metadata from Composio`);
  } catch (_error) {
    console.warn(
      `[Instagram-Whisper:${requestId}] Composio metadata failed, will try video download anyway`,
    );
    composioMetadata = { reelId };
  }

  // Download video
  const {
    buffer,
    metadata: downloadMetadata,
    cleanup,
  } = await downloadReelVideo(reelId);

  try {
    // Transcribe with Whisper
    const whisperResult = await transcribeWithWhisper(
      buffer,
      preferredLanguage,
      requestId,
    );

    // Convert to standard format
    const transcript: TranscriptSegment[] = whisperResult.segments
      ? convertWhisperSegments(whisperResult.segments)
      : [{ text: whisperResult.text, start: 0, duration: 0 }];

    const fullText = transcript.map((s) => s.text).join(" ");

    // Merge metadata from Composio and download
    const finalMetadata: ReelMetadata = {
      ...composioMetadata,
      ...downloadMetadata,
      duration: whisperResult.duration,
    };

    console.log(
      `[Instagram-Whisper:${requestId}] Complete: ${transcript.length} segments, ${fullText.length} chars, ${whisperResult.duration}s`,
    );

    return {
      transcript,
      fullText,
      metadata: finalMetadata,
      language: whisperResult.language ?? preferredLanguage,
      transcriptSource: "whisper",
    };
  } finally {
    await cleanup();
  }
}
