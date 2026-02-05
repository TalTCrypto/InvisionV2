/**
 * POST /api/audio/transcribe
 *
 * Receives an audio file, transcribes it with Whisper, and returns the
 * segmented transcript as JSON.  The buffer lives in memory only for the
 * duration of the request — nothing is written to disk.
 *
 * Body  (multipart/form-data)
 *   audio    File     Required – the audio file.
 *   language string   Optional – ISO 639-1 hint (e.g. "fr").
 *
 * 200  { success: true,  segments, fullText, language, durationSeconds }
 * 400  { success: false, error }   – missing field / bad format / empty file
 * 401  { success: false, error }   – not authenticated
 * 413  { success: false, error }   – file exceeds 25 MB
 * 500  { success: false, error }   – Whisper or internal failure
 */

import { type NextRequest } from "next/server";
import { auth } from "~/server/better-auth";
import {
  transcribeAudio,
  MAX_AUDIO_SIZE_BYTES,
  SUPPORTED_EXTENSIONS,
} from "~/server/utils/audio-transcriber";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // --- auth ---
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) {
    return json({ success: false, error: "Unauthorized" }, 401);
  }

  // --- parse multipart ---
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return json({ success: false, error: "Invalid multipart body" }, 400);
  }

  const fileEntry = formData.get("audio");

  // FormData.get returns string | File | null; reject anything that isn't a File
  if (!fileEntry || typeof fileEntry === "string") {
    return json(
      {
        success: false,
        error: `Missing "audio" field. Send multipart/form-data with field name "audio". Accepted formats: ${SUPPORTED_EXTENSIONS.join(", ")}`,
      },
      400,
    );
  }

  // --- early size guards (before reading the full body into memory) ---
  if (fileEntry.size === 0) {
    return json({ success: false, error: "File is empty" }, 400);
  }

  if (fileEntry.size > MAX_AUDIO_SIZE_BYTES) {
    return json(
      {
        success: false,
        error: `File too large (${(fileEntry.size / 1024 / 1024).toFixed(1)} MB). Max: ${MAX_AUDIO_SIZE_BYTES / 1024 / 1024} MB`,
      },
      413,
    );
  }

  // --- optional language hint ---
  const langEntry = formData.get("language");
  const language = typeof langEntry === "string" ? langEntry : undefined;

  // --- read buffer + transcribe ---
  // Format validation (magic bytes) happens inside transcribeAudio;
  // the client-supplied Content-Type is deliberately ignored.
  try {
    const buffer = Buffer.from(await fileEntry.arrayBuffer());
    const result = await transcribeAudio(buffer, language);
    return json({ success: true, ...result }, 200);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Transcription failed";
    const status = message.includes("Unsupported audio format") ? 400 : 500;
    return json({ success: false, error: message }, status);
  }
}

// ---------------------------------------------------------------------------
// helper
// ---------------------------------------------------------------------------

function json(body: object, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
