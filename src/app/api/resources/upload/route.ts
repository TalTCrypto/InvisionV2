/**
 * File Upload & Parsing API for Resources
 * Supports: PDF, CSV, TSV, TXT, SRT, DOCX, JSON, MD
 * Returns extracted text content ready for resource creation
 */

import { type NextRequest } from "next/server";
import { auth } from "~/server/better-auth";

// Max file size: 20MB
const MAX_FILE_SIZE = 20 * 1024 * 1024;

const SUPPORTED_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "text/csv": "csv",
  "text/tab-separated-values": "tsv",
  "text/plain": "txt",
  "application/json": "json",
  "text/markdown": "md",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "application/msword": "doc",
};

function getFileType(file: File): string | null {
  // Check extension FIRST (more specific than MIME for .srt, .md, .tsv, etc.)
  const ext = file.name.split(".").pop()?.toLowerCase();
  const extMap: Record<string, string> = {
    pdf: "pdf",
    csv: "csv",
    tsv: "tsv",
    txt: "txt",
    srt: "srt",
    json: "json",
    md: "md",
    docx: "docx",
    doc: "doc",
  };

  if (ext && extMap[ext]) return extMap[ext];

  // Fallback to MIME type
  const mimeType = SUPPORTED_TYPES[file.type];
  if (mimeType) return mimeType;

  return null;
}

/**
 * Parse PDF file → structured text with page markers
 */
async function parsePDF(buffer: Buffer): Promise<{
  content: string;
  pageCount: number;
}> {
  // pdf-parse v2 uses a class-based API
  const { PDFParse } = (await import("pdf-parse")) as {
    PDFParse: new (opts: { data: Uint8Array; verbosity: number }) => {
      load: () => Promise<void>;
      getText: () => Promise<unknown>;
    };
  };
  const parser = new PDFParse({ data: new Uint8Array(buffer), verbosity: 0 });
  await parser.load();

  const textResult = (await parser.getText()) as {
    pages: { text: string; num: number }[];
    text: string;
    total: number;
  };

  let content = "";

  // Build structured output with page markers for precision retrieval
  if (textResult.pages.length > 0) {
    for (const page of textResult.pages) {
      const pageText = page.text.trim();
      if (pageText) {
        content += `\n[PAGE ${page.num}]\n${pageText}\n`;
      }
    }
  }

  if (!content.trim()) {
    content = textResult.text;
  }

  return {
    content: content.trim(),
    pageCount: textResult.total,
  };
}

/**
 * Parse CSV/TSV → structured text with headers and row numbers
 */
async function parseCSV(
  text: string,
  delimiter?: string,
): Promise<{ content: string; rowCount: number }> {
  const Papa = (await import("papaparse")).default;

  const result = Papa.parse<string[]>(text, {
    delimiter,
    skipEmptyLines: true,
  });

  if (result.errors.length > 0 && result.data.length === 0) {
    throw new Error(
      `Erreur de parsing CSV: ${result.errors[0]?.message ?? "format invalide"}`,
    );
  }

  const rows = result.data;
  if (rows.length === 0) {
    throw new Error("Le fichier CSV est vide");
  }

  // First row as headers
  const headers = rows[0]!;
  const dataRows = rows.slice(1);

  // Build structured text: each row is explicitly labeled
  const lines: string[] = [];
  lines.push(`[HEADERS] ${headers.join(" | ")}`);
  lines.push(`[TOTAL ROWS] ${dataRows.length}`);
  lines.push("");

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i]!;
    const rowParts: string[] = [];
    for (let j = 0; j < headers.length; j++) {
      const header = headers[j] ?? `Col${j + 1}`;
      const value = row[j] ?? "";
      if (value.trim()) {
        rowParts.push(`${header}: ${value}`);
      }
    }
    lines.push(`[ROW ${i + 1}] ${rowParts.join(" | ")}`);
  }

  return {
    content: lines.join("\n"),
    rowCount: dataRows.length,
  };
}

/**
 * Parse SRT subtitle file → text with timestamps
 */
function parseSRT(text: string): string {
  const blocks = text.trim().split(/\n\s*\n/);
  const lines: string[] = [];

  for (const block of blocks) {
    const parts = block.trim().split("\n");
    if (parts.length < 3) continue;

    const timestamp = parts[1]?.trim() ?? "";
    const subtitleText = parts.slice(2).join(" ").trim();

    if (subtitleText) {
      // Extract start time
      const timeMatch = /(\d{2}):(\d{2}):(\d{2})[.,](\d{3})/.exec(timestamp);
      if (timeMatch) {
        const hours = parseInt(timeMatch[1]!, 10);
        const minutes = parseInt(timeMatch[2]!, 10);
        const seconds = parseInt(timeMatch[3]!, 10);
        const totalSeconds = hours * 3600 + minutes * 60 + seconds;
        const mm = Math.floor(totalSeconds / 60);
        const ss = totalSeconds % 60;
        lines.push(`[${mm}:${ss.toString().padStart(2, "0")}] ${subtitleText}`);
      } else {
        lines.push(subtitleText);
      }
    }
  }

  return lines.join("\n");
}

/**
 * Parse DOCX → text
 */
async function parseDOCX(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

/**
 * Parse JSON → structured text
 */
function parseJSON(text: string): string {
  const data = JSON.parse(text) as unknown;
  return formatJsonStructured(data, "");
}

function formatJsonStructured(data: unknown, prefix: string): string {
  if (data === null || data === undefined) return `${prefix}(vide)`;

  if (Array.isArray(data)) {
    if (data.length === 0) return `${prefix}(liste vide)`;

    // If array of objects (tabular), format as rows
    if (typeof data[0] === "object" && data[0] !== null) {
      const lines: string[] = [];
      lines.push(`${prefix}[LISTE: ${data.length} éléments]`);
      for (let i = 0; i < data.length; i++) {
        lines.push(
          formatJsonStructured(data[i], `${prefix}[ELEMENT ${i + 1}] `),
        );
      }
      return lines.join("\n");
    }

    return `${prefix}${data.join(", ")}`;
  }

  if (typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const lines: string[] = [];
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === "object" && value !== null) {
        lines.push(`${prefix}${key}:`);
        lines.push(formatJsonStructured(value, prefix + "  "));
      } else {
        lines.push(`${prefix}${key}: ${String(value)}`);
      }
    }
    return lines.join("\n");
  }

  return `${prefix}${String(data as string | number | boolean)}`;
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user?.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return Response.json({ error: "Aucun fichier fourni" }, { status: 400 });
    }

    // Validate size
    if (file.size > MAX_FILE_SIZE) {
      return Response.json(
        {
          error: `Le fichier est trop volumineux (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`,
        },
        { status: 400 },
      );
    }

    // Validate type
    const fileType = getFileType(file);
    if (!fileType) {
      return Response.json(
        {
          error: `Type de fichier non supporté. Formats acceptés: PDF, CSV, TSV, TXT, SRT, DOCX, JSON, MD`,
        },
        { status: 400 },
      );
    }

    let content: string;
    let pageCount: number | undefined;
    let rowCount: number | undefined;

    const buffer = Buffer.from(await file.arrayBuffer());

    switch (fileType) {
      case "pdf": {
        const result = await parsePDF(buffer);
        content = result.content;
        pageCount = result.pageCount;
        break;
      }
      case "csv": {
        const text = buffer.toString("utf-8");
        const result = await parseCSV(text, ",");
        content = result.content;
        rowCount = result.rowCount;
        break;
      }
      case "tsv": {
        const text = buffer.toString("utf-8");
        const result = await parseCSV(text, "\t");
        content = result.content;
        rowCount = result.rowCount;
        break;
      }
      case "srt": {
        const text = buffer.toString("utf-8");
        content = parseSRT(text);
        break;
      }
      case "docx": {
        content = await parseDOCX(buffer);
        break;
      }
      case "json": {
        const text = buffer.toString("utf-8");
        content = parseJSON(text);
        break;
      }
      case "txt":
      case "md":
      default: {
        content = buffer.toString("utf-8");
        break;
      }
    }

    if (!content.trim()) {
      return Response.json(
        { error: "Le fichier est vide ou ne contient pas de texte lisible" },
        { status: 400 },
      );
    }

    return Response.json({
      content,
      metadata: {
        fileName: file.name,
        fileType,
        fileSize: file.size,
        charCount: content.length,
        wordCount: content.split(/\s+/).length,
        ...(pageCount !== undefined && { pageCount }),
        ...(rowCount !== undefined && { rowCount }),
      },
    });
  } catch (error) {
    console.error("[Resource Upload] Error:", error);
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erreur lors du traitement du fichier",
      },
      { status: 500 },
    );
  }
}
