/**
 * YouTube Transcript via Whisper
 * Fallback solution when YouTube captions are not accessible
 * Downloads audio using yt-dlp and transcribes using OpenAI Whisper API
 *
 * Features:
 * - Fully async and non-blocking
 * - Scalable for multiple concurrent users
 * - Automatic cleanup of temp files
 * - Robust format selection with fallbacks
 */

import { spawn } from "child_process";
import { readFile, mkdtemp, readdir, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import { env } from "~/env";
import type {
  TranscriptSegment,
  VideoMetadata,
  TranscriptResult,
} from "./youtube-transcript";
import { extractVideoId } from "./youtube-transcript";

interface WhisperSegment {
  id: number;
  start: number;
  end: number;
  text: string;
}

interface WhisperResponse {
  text: string;
  segments?: WhisperSegment[];
  language?: string;
}

interface YtDlpMetadata {
  title: string;
  channel: string;
  uploader?: string;
  duration: number;
  view_count?: number;
  description?: string;
}

/**
 * Execute yt-dlp command with timeout and proper error handling
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
 * Download audio from YouTube video using yt-dlp
 * Fully async with automatic cleanup
 */
async function downloadAudio(videoId: string): Promise<{
  buffer: Buffer;
  metadata: VideoMetadata;
  cleanup: () => Promise<void>;
}> {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const requestId = randomUUID().slice(0, 8);

  // Create unique temp directory for this request
  const tempDir = await mkdtemp(join(tmpdir(), `yt-whisper-${requestId}-`));

  const cleanup = async () => {
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  };

  try {
    console.log(`[Whisper:${requestId}] Downloading audio for ${videoId}`);

    // Run yt-dlp with flexible format selection
    // Try multiple format options for compatibility
    await executeYtDlp([
      "-f",
      "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best",
      "--no-playlist",
      "--no-warnings",
      "--write-info-json",
      "-o",
      join(tempDir, "%(id)s.%(ext)s"),
      url,
    ]);

    // Find the downloaded files
    const files = await readdir(tempDir);
    const audioFile = files.find(
      (f) =>
        !f.endsWith(".json") &&
        (f.endsWith(".m4a") ||
          f.endsWith(".webm") ||
          f.endsWith(".opus") ||
          f.endsWith(".mp3") ||
          f.endsWith(".mp4") ||
          f.endsWith(".ogg")),
    );

    if (!audioFile) {
      throw new Error("Audio file not found after download");
    }

    const audioPath = join(tempDir, audioFile);

    // Read metadata from info.json
    const infoFile = files.find((f) => f.endsWith(".info.json"));
    let metadata: VideoMetadata = { videoId };

    if (infoFile) {
      try {
        const infoContent = await readFile(join(tempDir, infoFile), "utf-8");
        const info = JSON.parse(infoContent) as YtDlpMetadata;
        metadata = {
          videoId,
          title: info.title,
          channelTitle: info.channel || info.uploader,
          duration: String(info.duration),
          viewCount: info.view_count ? String(info.view_count) : undefined,
          description: info.description?.substring(0, 500),
        };
      } catch {
        console.log(`[Whisper:${requestId}] Could not parse metadata`);
      }
    }

    // Read audio file
    const buffer = await readFile(audioPath);
    console.log(
      `[Whisper:${requestId}] Downloaded ${(buffer.length / 1024 / 1024).toFixed(2)} MB`,
    );

    return { buffer, metadata, cleanup };
  } catch (error) {
    // Cleanup on error
    await cleanup();
    throw error;
  }
}

/**
 * Determine MIME type from buffer or use safe default
 */
function getAudioMimeType(buffer: Buffer): {
  mimeType: string;
  extension: string;
} {
  // Check magic bytes for common formats
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

  // Default to MP4 which Whisper handles well
  return { mimeType: "audio/mp4", extension: "m4a" };
}

/**
 * Transcribe audio buffer using OpenAI Whisper API
 * Non-blocking with proper timeout
 */
async function transcribeWithWhisper(
  audioBuffer: Buffer,
  language?: string,
  requestId?: string,
): Promise<WhisperResponse> {
  const id = requestId ?? "unknown";
  console.log(
    `[Whisper:${id}] Transcribing ${(audioBuffer.length / 1024 / 1024).toFixed(2)} MB...`,
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
  const timeout = setTimeout(() => controller.abort(), 300000); // 5 min timeout

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
      `[Whisper:${id}] Transcription complete: ${result.segments?.length ?? 0} segments`,
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
  whisperSegments: WhisperSegment[],
): TranscriptSegment[] {
  return whisperSegments.map((seg) => ({
    text: seg.text.trim(),
    start: seg.start,
    duration: seg.end - seg.start,
  }));
}

/**
 * Main function: Get YouTube transcript using Whisper
 * Fully async, non-blocking, handles concurrent requests
 */
export async function getYouTubeTranscriptViaWhisper(
  urlOrId: string,
  preferredLanguage = "fr",
): Promise<TranscriptResult> {
  const videoId = extractVideoId(urlOrId);

  if (!videoId) {
    throw new Error("Invalid YouTube URL or video ID");
  }

  const requestId = randomUUID().slice(0, 8);
  console.log(`[Whisper:${requestId}] Starting transcript for ${videoId}`);

  // Download audio
  const { buffer, metadata, cleanup } = await downloadAudio(videoId);

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

    console.log(
      `[Whisper:${requestId}] Complete: ${transcript.length} segments, ${fullText.length} chars`,
    );

    return {
      transcript,
      fullText,
      metadata,
      language: whisperResult.language ?? preferredLanguage,
    };
  } finally {
    // Always cleanup temp files
    await cleanup();
  }
}
