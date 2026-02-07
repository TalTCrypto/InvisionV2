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
 * - Multi-strategy bot detection bypass (cookies, player clients)
 */

import { spawn } from "child_process";
import { readFile, mkdtemp, readdir, rm, access } from "fs/promises";
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
import { homedir, platform } from "os";

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
 * Download strategies to bypass YouTube bot detection
 * Ordered by reliability (most reliable first)
 */
type DownloadStrategy =
  | { type: "cookies"; browser: string }
  | { type: "player_client"; client: string };

/**
 * Detect available browsers for cookie extraction
 */
async function detectAvailableBrowsers(): Promise<string[]> {
  const browsers = ["chrome", "firefox", "edge", "safari", "brave"];
  const available: string[] = [];

  // Browser cookie paths by OS and browser
  const cookiePaths: Record<string, Record<string, string>> = {
    darwin: {
      // macOS
      chrome: join(
        homedir(),
        "Library/Application Support/Google/Chrome/Default/Cookies",
      ),
      firefox: join(homedir(), "Library/Application Support/Firefox/Profiles"),
      edge: join(
        homedir(),
        "Library/Application Support/Microsoft Edge/Default/Cookies",
      ),
      safari: join(homedir(), "Library/Cookies/Cookies.binarycookies"),
      brave: join(
        homedir(),
        "Library/Application Support/BraveSoftware/Brave-Browser/Default/Cookies",
      ),
    },
    linux: {
      chrome: join(homedir(), ".config/google-chrome/Default/Cookies"),
      firefox: join(homedir(), ".mozilla/firefox"),
      edge: join(homedir(), ".config/microsoft-edge/Default/Cookies"),
      brave: join(
        homedir(),
        ".config/BraveSoftware/Brave-Browser/Default/Cookies",
      ),
    },
    win32: {
      chrome: join(
        homedir(),
        "AppData/Local/Google/Chrome/User Data/Default/Network/Cookies",
      ),
      firefox: join(homedir(), "AppData/Roaming/Mozilla/Firefox/Profiles"),
      edge: join(
        homedir(),
        "AppData/Local/Microsoft/Edge/User Data/Default/Network/Cookies",
      ),
      brave: join(
        homedir(),
        "AppData/Local/BraveSoftware/Brave-Browser/User Data/Default/Network/Cookies",
      ),
    },
  };

  const osPaths = cookiePaths[platform()] ?? {};

  for (const browser of browsers) {
    const path = osPaths[browser];
    if (!path) continue;

    try {
      await access(path);
      available.push(browser);
    } catch {
      // Browser not available
    }
  }

  return available;
}

/**
 * Get download strategies in order of preference
 */
async function getDownloadStrategies(): Promise<DownloadStrategy[]> {
  const strategies: DownloadStrategy[] = [];

  // 1. Try browser cookies first (most reliable)
  const browsers = await detectAvailableBrowsers();
  for (const browser of browsers) {
    strategies.push({ type: "cookies", browser });
  }

  // 2. Fallback to various player clients
  const playerClients = [
    "ANDROID_TESTSUITE", // Most reliable client
    "ANDROID_EMBEDDED", // Embedded player
    "IOS", // iOS client
    "ANDROID", // Standard Android (current default)
  ];

  for (const client of playerClients) {
    strategies.push({ type: "player_client", client });
  }

  return strategies;
}

async function executeYtDlp(
  args: string[],
  strategy?: DownloadStrategy,
  timeoutMs = 120000,
  retryCount = 0,
  maxRetries = 3,
): Promise<{ stdout: string; stderr: string }> {
  const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  ];

  // Build strategy-specific args
  const strategyArgs: string[] = [];
  if (strategy) {
    if (strategy.type === "cookies") {
      strategyArgs.push("--cookies-from-browser", strategy.browser);
    } else if (strategy.type === "player_client") {
      strategyArgs.push(
        "--extractor-args",
        `youtube:player_client=${strategy.client}`,
      );
    }
  }

  const enhancedArgs = [
    ...args,
    ...strategyArgs,
    "--user-agent",
    userAgents[retryCount % userAgents.length]!,
    "--sleep-requests",
    "1",
    "--extractor-retries",
    "5",
    "--fragment-retries",
    "10",
  ];

  return new Promise((resolve, reject) => {
    const ytdlp = spawn("yt-dlp", enhancedArgs, {
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
        const isBotDetection =
          stderr.includes("Sign in to confirm") ||
          stderr.includes("not a bot") ||
          stderr.includes("HTTP Error 403") ||
          stderr.includes("HTTP Error 429") ||
          stderr.includes("Too Many Requests");

        if (isBotDetection && retryCount < maxRetries) {
          const backoffDelay = Math.min(1000 * Math.pow(2, retryCount), 8000);
          console.log(
            `[yt-dlp] Bot detection, retrying in ${backoffDelay}ms (attempt ${retryCount + 1}/${maxRetries})`,
          );
          setTimeout(() => {
            void executeYtDlp(
              args,
              strategy,
              timeoutMs,
              retryCount + 1,
              maxRetries,
            )
              .then(resolve)
              .catch((err: unknown) =>
                reject(err instanceof Error ? err : new Error(String(err))),
              );
          }, backoffDelay);
        } else {
          reject(new Error(`yt-dlp exit code ${code}: ${stderr}`));
        }
      }
    });

    ytdlp.on("error", (err) => {
      clearTimeout(timeout);
      reject(new Error(`Failed to spawn yt-dlp: ${err.message}`));
    });
  });
}

/**
 * Execute yt-dlp with fallback strategies
 * Tries multiple approaches until one succeeds
 */
async function executeYtDlpWithFallback(
  args: string[],
  requestId: string,
): Promise<{ stdout: string; stderr: string }> {
  const strategies = await getDownloadStrategies();
  const errors: Array<{ strategy: string; error: string }> = [];

  for (let i = 0; i < strategies.length; i++) {
    const strategy = strategies[i]!;
    const strategyName =
      strategy.type === "cookies"
        ? `cookies:${strategy.browser}`
        : `player:${strategy.client}`;

    try {
      console.log(
        `[Whisper:${requestId}] Trying strategy ${i + 1}/${strategies.length}: ${strategyName}`,
      );
      const result = await executeYtDlp(args, strategy);
      console.log(
        `[Whisper:${requestId}] Success with strategy: ${strategyName}`,
      );
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push({ strategy: strategyName, error: errorMsg });
      console.log(
        `[Whisper:${requestId}] Strategy ${strategyName} failed: ${errorMsg.substring(0, 100)}`,
      );

      // If this is not the last strategy, continue to next
      if (i < strategies.length - 1) {
        // Small delay before trying next strategy
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }
    }
  }

  // All strategies failed
  const errorSummary = errors
    .map((e) => `${e.strategy}: ${e.error.substring(0, 80)}`)
    .join("\n");
  throw new Error(
    `All ${strategies.length} download strategies failed:\n${errorSummary}`,
  );
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

    // Run yt-dlp with multi-strategy fallback to bypass bot detection
    await executeYtDlpWithFallback(
      [
        "-f",
        "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best",
        "--no-playlist",
        "--no-warnings",
        "--write-info-json",
        "-o",
        join(tempDir, "%(id)s.%(ext)s"),
        url,
      ],
      requestId,
    );

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
