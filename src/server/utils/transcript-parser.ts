/**
 * Transcript Parser — multi-format
 * Parses SRT, VTT, timestamped text and plain text into TranscriptSegment[].
 */

import type { TranscriptSegment } from "./youtube-transcript";

export type TranscriptFormat = "srt" | "vtt" | "timestamped" | "plain";

export interface ParsedTranscript {
  segments: TranscriptSegment[];
  fullText: string;
  format: TranscriptFormat;
  estimatedDurationSeconds: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * "00:01:23,456" | "1:23.4" | "00:01:23" → seconds (float)
 */
function parseTimestampToSeconds(ts: string): number {
  const normalized = ts.replace(",", ".").trim();
  const parts = normalized.split(":");
  if (parts.length === 3) {
    return (
      parseInt(parts[0] ?? "0", 10) * 3600 +
      parseInt(parts[1] ?? "0", 10) * 60 +
      parseFloat(parts[2] ?? "0")
    );
  }
  if (parts.length === 2) {
    return parseInt(parts[0] ?? "0", 10) * 60 + parseFloat(parts[1] ?? "0");
  }
  return parseFloat(normalized);
}

/** Strip HTML / VTT inline-timestamp tags (e.g. `<c>`, `<00:01:23.456>`) */
function stripTags(text: string): string {
  return text.replace(/<[^>]+>/g, "").trim();
}

// ---------------------------------------------------------------------------
// Format detection
// ---------------------------------------------------------------------------

function detectFormat(raw: string): TranscriptFormat {
  if (raw.trimStart().startsWith("WEBVTT")) return "vtt";
  if (raw.includes("-->")) return "srt";
  // Any line starting with an optional bracket + timestamp + space
  if (/^\[?\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?\]?\s/m.test(raw))
    return "timestamped";
  return "plain";
}

// ---------------------------------------------------------------------------
// Format-specific parsers
// ---------------------------------------------------------------------------

/**
 * SRT & VTT share the same `-->` block structure; one parser handles both.
 * VTT may have position metadata after the end-timestamp — ignored here.
 */
function parseSrtOrVtt(raw: string): TranscriptSegment[] {
  const blocks = raw.split(/\n\s*\n/);
  const segments: TranscriptSegment[] = [];

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    const arrowIdx = lines.findIndex((l) => l.includes("-->"));
    if (arrowIdx === -1) continue;

    const arrowLine = lines[arrowIdx];
    if (!arrowLine) continue;

    const dashPos = arrowLine.indexOf("-->");
    const startStr = arrowLine.substring(0, dashPos).trim();
    // Everything after `-->` — first whitespace-delimited token is the end time
    const afterDash = arrowLine.substring(dashPos + 3).trim();
    const endStr = afterDash.split(/\s/)[0] ?? "";

    const start = parseTimestampToSeconds(startStr);
    const end = parseTimestampToSeconds(endStr);
    if (Number.isNaN(start) || Number.isNaN(end)) continue;

    const text = stripTags(lines.slice(arrowIdx + 1).join(" "));
    if (text) {
      segments.push({ text, start, duration: Math.max(0, end - start) });
    }
  }

  return segments;
}

/**
 * Lines like:  [0:01] text  |  00:01:23 - text  |  1:23 text
 * Duration per segment is inferred from the gap to the next timestamp.
 */
function parseTimestamped(raw: string): TranscriptSegment[] {
  const lines = raw.split("\n").filter((l) => l.trim());
  const segments: TranscriptSegment[] = [];
  const pattern =
    /^\[?(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?)\]?\s*[-–—]?\s*(.+)$/;

  for (const line of lines) {
    const match = pattern.exec(line.trim());
    if (match?.[1] && match?.[2]) {
      const start = parseTimestampToSeconds(match[1]);
      if (!Number.isNaN(start)) {
        segments.push({ text: match[2].trim(), start, duration: 0 });
      }
    }
  }

  // Fill durations from gap between consecutive start times
  for (let i = 0; i < segments.length - 1; i++) {
    const current = segments[i];
    const next = segments[i + 1];
    if (current && next) {
      current.duration = next.start - current.start;
    }
  }

  // Last segment: rough estimate at ~2.5 words / second
  const last = segments[segments.length - 1];
  if (last) {
    last.duration = Math.max(last.text.split(/\s+/).length / 2.5, 2);
  }

  return segments;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse any supported transcript format into a uniform segment array.
 *
 * Supported formats (auto-detected):
 *   • **SRT**         – numbered blocks with `-->` and comma-separated ms
 *   • **VTT**         – `WEBVTT` header, dot-separated ms, optional metadata
 *   • **Timestamped** – lines starting with `[MM:SS]`, `HH:MM:SS`, etc.
 *   • **Plain text**  – no timestamps; becomes a single segment; duration
 *                        is estimated from word count (~150 wpm)
 */
export function parseTranscript(raw: string): ParsedTranscript {
  // Normalise: BOM, CRLF → LF
  const normalized = raw
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  const format = detectFormat(normalized);
  let segments: TranscriptSegment[];

  switch (format) {
    case "vtt":
    case "srt":
      segments = parseSrtOrVtt(normalized);
      break;
    case "timestamped":
      segments = parseTimestamped(normalized);
      break;
    case "plain":
    default:
      segments = [{ text: normalized.trim(), start: 0, duration: 0 }];
      break;
  }

  // Safety: structured parse yielded nothing → fall back to plain
  if (segments.length === 0 && normalized.trim()) {
    segments = [{ text: normalized.trim(), start: 0, duration: 0 }];
  }

  const fullText = segments.map((s) => s.text).join(" ");

  // Total duration: end of last segment, or estimate from word count
  const last = segments[segments.length - 1];
  const endFromSegments = last ? last.start + last.duration : 0;
  const estimatedDurationSeconds =
    endFromSegments > 0
      ? endFromSegments
      : Math.ceil((fullText.split(/\s+/).filter(Boolean).length / 150) * 60);

  return { segments, fullText, format, estimatedDurationSeconds };
}
