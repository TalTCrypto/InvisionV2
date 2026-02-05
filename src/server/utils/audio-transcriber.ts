/**
 * Audio Transcriber
 *
 * Validates and transcribes an in-memory audio buffer via OpenAI Whisper.
 * Nothing is written to disk — the buffer is sent straight to the API.
 *
 * Format gating is done on magic bytes, NOT on the client-supplied
 * Content-Type, so a renamed/spoofed extension cannot bypass validation.
 */

import { env } from "~/env";

// ---------------------------------------------------------------------------
// Limits & supported formats
// ---------------------------------------------------------------------------

/** Whisper API hard limit */
export const MAX_AUDIO_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

/**
 * Extensions Whisper accepts.
 * mp4 / m4a covers both audio-only and video containers — Whisper
 * extracts the audio track automatically.
 */
export const SUPPORTED_EXTENSIONS = [
  "mp3",
  "mp4",
  "m4a",
  "webm",
  "wav",
  "flac",
  "ogg",
  "opus",
  "aac",
] as const;

// ---------------------------------------------------------------------------
// Magic-byte detection
// ---------------------------------------------------------------------------

interface AudioFormat {
  mimeType: string;
  extension: string;
}

/**
 * Identify audio format from file-header magic bytes.
 * Returns null when no known audio signature is found.
 */
function detectAudioFormat(buffer: Buffer): AudioFormat | null {
  if (buffer.length < 12) return null;

  // FLAC — "fLaC"
  if (buffer.slice(0, 4).toString() === "fLaC") {
    return { mimeType: "audio/flac", extension: "flac" };
  }

  // OGG / Opus — "OggS"
  if (buffer.slice(0, 4).toString() === "OggS") {
    return { mimeType: "audio/ogg", extension: "ogg" };
  }

  // WAV — "RIFF????WAVE"
  if (
    buffer.slice(0, 4).toString() === "RIFF" &&
    buffer.slice(8, 12).toString() === "WAVE"
  ) {
    return { mimeType: "audio/wav", extension: "wav" };
  }

  // MP4 / M4A — "ftyp" at byte-offset 4
  if (buffer.slice(4, 8).toString() === "ftyp") {
    return { mimeType: "audio/mp4", extension: "m4a" };
  }

  // WebM — EBML header 1A 45 DF A3
  if (buffer.slice(0, 4).toString("hex") === "1a45dfa3") {
    return { mimeType: "audio/webm", extension: "webm" };
  }

  // MP3 — ID3v2 tag
  if (buffer.slice(0, 3).toString() === "ID3") {
    return { mimeType: "audio/mpeg", extension: "mp3" };
  }

  // MP3 / raw AAC (ADTS) — sync word 0xFF, upper 3 bits of next byte set
  if (
    buffer[0] === 0xff &&
    buffer[1] !== undefined &&
    (buffer[1] & 0xe0) === 0xe0
  ) {
    return { mimeType: "audio/mpeg", extension: "mp3" };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Whisper types
// ---------------------------------------------------------------------------

interface WhisperSegment {
  id: number;
  start: number;
  end: number;
  text: string;
}

interface WhisperVerboseResponse {
  text: string;
  segments?: WhisperSegment[];
  language?: string;
}

export interface TranscribedAudio {
  segments: Array<{ text: string; start: number; duration: number }>;
  fullText: string;
  language: string;
  durationSeconds: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate size + format, then transcribe via Whisper.
 *
 * @throws if the buffer exceeds 25 MB, has no recognised audio signature,
 *         or the Whisper call itself fails.
 */
export async function transcribeAudio(
  buffer: Buffer,
  preferredLanguage?: string,
): Promise<TranscribedAudio> {
  // --- size gate ---
  if (buffer.length > MAX_AUDIO_SIZE_BYTES) {
    throw new Error(
      `File exceeds maximum size of ${MAX_AUDIO_SIZE_BYTES / 1024 / 1024} MB`,
    );
  }

  // --- format gate (magic bytes) ---
  const format = detectAudioFormat(buffer);
  if (!format) {
    throw new Error(
      `Unsupported audio format. Accepted: ${SUPPORTED_EXTENSIONS.join(", ")}`,
    );
  }

  // --- multipart payload ---
  const formData = new FormData();

  const audioBlob = new Blob([new Uint8Array(buffer)], {
    type: format.mimeType,
  });
  formData.append("file", audioBlob, `audio.${format.extension}`);
  formData.append("model", "whisper-1");
  formData.append("response_format", "verbose_json");

  if (preferredLanguage) {
    formData.append("language", preferredLanguage);
  }

  // --- 5-min timeout guard ---
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 300_000);

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
      const detail = await response.text();
      throw new Error(`Whisper API ${response.status}: ${detail}`);
    }

    const result = (await response.json()) as WhisperVerboseResponse;

    // --- normalise to shared segment shape ---
    const segments = (result.segments ?? []).map((seg) => ({
      text: seg.text.trim(),
      start: seg.start,
      duration: seg.end - seg.start,
    }));

    const fullText =
      segments.length > 0 ? segments.map((s) => s.text).join(" ") : result.text;

    const lastSeg = segments[segments.length - 1];
    const durationSeconds = lastSeg ? lastSeg.start + lastSeg.duration : 0;

    return {
      segments,
      fullText,
      language: result.language ?? preferredLanguage ?? "fr",
      durationSeconds,
    };
  } finally {
    clearTimeout(timeout);
  }
}
