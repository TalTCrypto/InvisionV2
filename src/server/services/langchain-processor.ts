/**
 * Document Processor — Precision Edition
 *
 * Ultra-precise chunking & retrieval pipeline.
 * Designed for NotebookLM-level accuracy:
 *   - Every detail retrievable (page 19, line 383, row 47 of a CSV)
 *   - Structure-aware chunking (headings, pages, rows, timestamps)
 *   - Metadata-enriched chunks (section, page, row index)
 *   - Batched embeddings to minimize OpenAI API calls
 */

import { OpenAIEmbeddings } from "@langchain/openai";
import { env } from "~/env";

// ── Security limits ──────────────────────────────────────────────────────────

const MAX_CHUNK_SIZE = 8000; // chars per chunk (embedding model limit ~8k tokens)
const MAX_CHUNKS_JSON_SIZE = 50 * 1024 * 1024; // 50MB serialised
const MAX_CONTENT_SIZE = 5_000_000; // 5M chars (~1.25M words, handles big CSVs)
const EMBEDDING_BATCH_SIZE = 100; // OpenAI batch limit

// ── Types ────────────────────────────────────────────────────────────────────

export interface Chunk {
  text: string;
  index: number;
  /** Metadata baked into the chunk for retrieval precision */
  metadata?: ChunkMetadata;
}

export interface ChunkMetadata {
  section?: string; // Heading / section title
  page?: number; // PDF page number
  rowRange?: string; // CSV: "rows 1-5" or "row 47"
  timestamp?: string; // SRT/transcript: "12:34"
  sourceType?: string; // "narrative" | "tabular" | "transcript" | "structured"
}

export interface ChunkWithEmbedding extends Chunk {
  embedding: number[];
}

export interface SearchResult {
  chunk: ChunkWithEmbedding;
  similarity: number;
}

// ── Content-type detection ───────────────────────────────────────────────────

type ContentType = "tabular" | "transcript" | "pdf" | "narrative";

function detectContentType(content: string): ContentType {
  // Tabular: CSV-style with [HEADERS] and [ROW N] markers
  if (content.includes("[HEADERS]") && content.includes("[ROW ")) {
    return "tabular";
  }

  // Transcript: SRT-style with [MM:SS] timestamps
  if (/\[\d{1,3}:\d{2}\]/.test(content.slice(0, 2000))) {
    return "transcript";
  }

  // PDF: has [PAGE N] markers
  if (content.includes("[PAGE ")) {
    return "pdf";
  }

  return "narrative";
}

// ── Chunking strategies ──────────────────────────────────────────────────────

/**
 * Tabular chunking: small groups of rows with header context.
 * Each chunk contains ~5-10 rows + the header line for context.
 * This guarantees that row-level queries hit the exact chunk.
 */
function chunkTabular(content: string): Chunk[] {
  const lines = content.split("\n");
  const chunks: Chunk[] = [];

  // Extract header line and total rows line
  const headerLine = lines.find((l) => l.startsWith("[HEADERS]")) ?? "";
  const totalLine = lines.find((l) => l.startsWith("[TOTAL ROWS]")) ?? "";
  const contextHeader = [headerLine, totalLine].filter(Boolean).join("\n");

  // Collect all row lines
  const rowLines = lines.filter((l) => l.startsWith("[ROW "));

  // Group rows into chunks of 5 rows each (small for precision)
  const ROWS_PER_CHUNK = 5;
  for (let i = 0; i < rowLines.length; i += ROWS_PER_CHUNK) {
    const batch = rowLines.slice(i, i + ROWS_PER_CHUNK);
    const firstRow = i + 1;
    const lastRow = Math.min(i + ROWS_PER_CHUNK, rowLines.length);

    const text = `${contextHeader}\n\n${batch.join("\n")}`;

    chunks.push({
      text: text.trim(),
      index: chunks.length,
      metadata: {
        rowRange:
          firstRow === lastRow
            ? `row ${firstRow}`
            : `rows ${firstRow}-${lastRow}`,
        sourceType: "tabular",
      },
    });
  }

  return chunks;
}

/**
 * Transcript chunking: sliding window over timestamped lines.
 * ~30s segments with 10s overlap for natural speech boundaries.
 */
function chunkTranscript(content: string): Chunk[] {
  const lines = content.split("\n").filter((l) => l.trim());
  const chunks: Chunk[] = [];

  const LINES_PER_CHUNK = 15; // ~30-60 seconds of speech
  const OVERLAP = 5;

  for (let i = 0; i < lines.length; i += LINES_PER_CHUNK - OVERLAP) {
    const batch = lines.slice(i, i + LINES_PER_CHUNK);
    if (batch.length === 0) break;

    // Extract first timestamp
    const firstTimestamp =
      batch[0]?.match(/\[(\d{1,3}:\d{2})\]/)?.[1] ?? undefined;

    chunks.push({
      text: batch.join("\n"),
      index: chunks.length,
      metadata: {
        timestamp: firstTimestamp,
        sourceType: "transcript",
      },
    });
  }

  return chunks;
}

/**
 * PDF chunking: respect page boundaries + heading-aware within pages.
 * Each page is independently chunked so page references are always accurate.
 */
function chunkPDF(content: string): Chunk[] {
  const chunks: Chunk[] = [];

  // Split by page markers
  const pageRegex = /\[PAGE (\d+)\]\n/g;
  const pages: { pageNum: number; text: string }[] = [];

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pageRegex.exec(content)) !== null) {
    if (pages.length > 0) {
      const lastPage = pages[pages.length - 1]!;
      lastPage.text = content.slice(lastIndex, match.index).trim();
    }
    pages.push({ pageNum: parseInt(match[1]!, 10), text: "" });
    lastIndex = match.index + match[0].length;
  }

  // Last page
  if (pages.length > 0) {
    pages[pages.length - 1]!.text = content.slice(lastIndex).trim();
  }

  // If no page markers found, fall back to narrative chunking
  if (pages.length === 0) {
    return chunkNarrative(content);
  }

  for (const page of pages) {
    if (!page.text.trim()) continue;

    // If page is short enough, keep as one chunk
    if (page.text.length <= 1200) {
      chunks.push({
        text: `[Page ${page.pageNum}]\n${page.text}`,
        index: chunks.length,
        metadata: {
          page: page.pageNum,
          sourceType: "structured",
        },
      });
      continue;
    }

    // Split long pages by headings or paragraphs
    const sections = splitByHeadingsOrParagraphs(page.text);
    let currentSection = "";

    for (const section of sections) {
      if (
        currentSection.length + section.length > 1200 &&
        currentSection.length > 0
      ) {
        chunks.push({
          text: `[Page ${page.pageNum}]\n${currentSection.trim()}`,
          index: chunks.length,
          metadata: {
            page: page.pageNum,
            section: extractSectionTitle(currentSection),
            sourceType: "structured",
          },
        });
        // Overlap: carry last 200 chars
        currentSection = currentSection.slice(-200) + "\n" + section;
      } else {
        currentSection += (currentSection ? "\n\n" : "") + section;
      }
    }

    if (currentSection.trim()) {
      chunks.push({
        text: `[Page ${page.pageNum}]\n${currentSection.trim()}`,
        index: chunks.length,
        metadata: {
          page: page.pageNum,
          section: extractSectionTitle(currentSection),
          sourceType: "structured",
        },
      });
    }
  }

  return chunks;
}

/**
 * Narrative chunking: heading-aware with smart overlap.
 * Respects document structure (headings, sections).
 * Uses 800-char chunks (smaller = more precise) with 200-char overlap.
 */
function chunkNarrative(content: string): Chunk[] {
  const chunks: Chunk[] = [];
  const CHUNK_SIZE = 800;
  const OVERLAP = 200;

  const sections = splitByHeadingsOrParagraphs(content);
  let currentChunk = "";
  let currentSection = "";

  for (const section of sections) {
    // Detect if this is a heading
    const isHeading =
      /^#{1,6}\s/.test(section) || /^[A-Z][A-Z\s]{3,}$/.test(section.trim());
    if (isHeading) {
      currentSection = section.trim();
    }

    if (section.length > MAX_CHUNK_SIZE) {
      // Force-split oversized sections
      if (currentChunk.trim()) {
        chunks.push({
          text: currentChunk.trim(),
          index: chunks.length,
          metadata: {
            section: currentSection || undefined,
            sourceType: "narrative",
          },
        });
      }

      for (let i = 0; i < section.length; i += CHUNK_SIZE - OVERLAP) {
        const slice = section.slice(i, i + CHUNK_SIZE);
        if (slice.trim()) {
          chunks.push({
            text: slice.trim(),
            index: chunks.length,
            metadata: {
              section: currentSection || undefined,
              sourceType: "narrative",
            },
          });
        }
      }
      currentChunk = "";
      continue;
    }

    if (
      currentChunk.length + section.length > CHUNK_SIZE &&
      currentChunk.length > 0
    ) {
      chunks.push({
        text: currentChunk.trim(),
        index: chunks.length,
        metadata: {
          section: currentSection || undefined,
          sourceType: "narrative",
        },
      });

      // Overlap
      currentChunk = currentChunk.slice(-OVERLAP) + "\n\n" + section;
    } else {
      currentChunk += (currentChunk ? "\n\n" : "") + section;
    }
  }

  if (currentChunk.trim()) {
    chunks.push({
      text: currentChunk.trim(),
      index: chunks.length,
      metadata: {
        section: currentSection || undefined,
        sourceType: "narrative",
      },
    });
  }

  return chunks;
}

// ── Helper functions ─────────────────────────────────────────────────────────

function splitByHeadingsOrParagraphs(text: string): string[] {
  // First try to split by headings (markdown or all-caps)
  const headingSplit = text.split(/\n(?=#{1,6}\s|\n[A-Z][A-Z\s]{3,}\n)/);
  if (headingSplit.length > 1) {
    // Further split large sections by paragraphs
    const result: string[] = [];
    for (const section of headingSplit) {
      if (section.length > 2000) {
        result.push(...section.split(/\n\n+/).filter((p) => p.trim()));
      } else if (section.trim()) {
        result.push(section);
      }
    }
    return result;
  }

  // Fallback to paragraph-level split
  return text.split(/\n\n+/).filter((p) => p.trim());
}

function extractSectionTitle(text: string): string | undefined {
  // Try to extract markdown heading
  const headingMatch = /^#{1,6}\s+(.+)/m.exec(text);
  if (headingMatch) return headingMatch[1]!.slice(0, 100);

  // Try all-caps title
  const capsMatch = /^([A-Z][A-Z\s]{3,})\n/.exec(text);
  if (capsMatch) return capsMatch[1]!.trim().slice(0, 100);

  return undefined;
}

// ── Main class ───────────────────────────────────────────────────────────────

export class DocumentProcessor {
  private embeddings: OpenAIEmbeddings;

  constructor() {
    this.embeddings = new OpenAIEmbeddings({
      openAIApiKey: env.OPENAI_API_KEY,
      modelName: "text-embedding-3-small",
    });
  }

  /**
   * Smart chunking: auto-detects content type and applies the optimal strategy.
   */
  async chunkDocument(content: string): Promise<Chunk[]> {
    const contentType = detectContentType(content);

    console.log(
      `[DocumentProcessor] Detected content type: ${contentType} (${content.length} chars)`,
    );

    let chunks: Chunk[];

    switch (contentType) {
      case "tabular":
        chunks = chunkTabular(content);
        break;
      case "transcript":
        chunks = chunkTranscript(content);
        break;
      case "pdf":
        chunks = chunkPDF(content);
        break;
      case "narrative":
      default:
        chunks = chunkNarrative(content);
        break;
    }

    // Safety: filter oversized chunks
    chunks = chunks.filter((c) => {
      if (c.text.length > MAX_CHUNK_SIZE) {
        console.warn(
          `[DocumentProcessor] Dropping oversized chunk #${c.index} (${c.text.length} chars)`,
        );
        return false;
      }
      return true;
    });

    // Re-index after filtering
    chunks.forEach((c, i) => (c.index = i));

    console.log(
      `[DocumentProcessor] Generated ${chunks.length} chunks (type: ${contentType})`,
    );

    return chunks;
  }

  /**
   * Generate embeddings in batches to respect OpenAI rate limits.
   */
  async generateEmbeddings(chunks: Chunk[]): Promise<ChunkWithEmbedding[]> {
    const result: ChunkWithEmbedding[] = [];

    for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
      const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);
      const texts = batch.map((c) => c.text);
      const embeddings = await this.embeddings.embedDocuments(texts);

      for (let j = 0; j < batch.length; j++) {
        result.push({
          ...batch[j]!,
          embedding: embeddings[j] ?? [],
        });
      }
    }

    return result;
  }

  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += (a[i] ?? 0) * (b[i] ?? 0);
      magnitudeA += (a[i] ?? 0) ** 2;
      magnitudeB += (b[i] ?? 0) ** 2;
    }

    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);

    if (magnitudeA === 0 || magnitudeB === 0) return 0;

    return dotProduct / (magnitudeA * magnitudeB);
  }

  /**
   * Semantic search with increased topK for precision.
   */
  async semanticSearch(
    query: string,
    chunksWithEmbeddings: ChunkWithEmbedding[],
    topK = 5,
  ): Promise<SearchResult[]> {
    const queryEmbedding = await this.embeddings.embedQuery(query);

    const results = chunksWithEmbeddings.map((chunk) => ({
      chunk,
      similarity: this.cosineSimilarity(queryEmbedding, chunk.embedding),
    }));

    results.sort((a, b) => b.similarity - a.similarity);

    return results.slice(0, topK);
  }

  /**
   * Process and store a resource with intelligent chunking.
   */
  async processResource(
    resourceId: string,
    content: string,
    updateFn: (data: {
      processingStatus: string;
      chunks?: string;
      processingError?: string | null;
    }) => Promise<void>,
  ): Promise<void> {
    try {
      if (content.length > MAX_CONTENT_SIZE) {
        throw new Error(
          `Content too large: ${content.length} chars (max: ${MAX_CONTENT_SIZE})`,
        );
      }

      await updateFn({ processingStatus: "processing" });

      const chunks = await this.chunkDocument(content);

      if (chunks.length === 0) {
        throw new Error("No valid chunks generated from content");
      }

      console.log(
        `[DocumentProcessor] Processing ${chunks.length} chunks for resource ${resourceId}`,
      );

      const chunksWithEmbeddings = await this.generateEmbeddings(chunks);
      const chunksJson = JSON.stringify(chunksWithEmbeddings);

      const jsonSizeBytes = Buffer.byteLength(chunksJson, "utf8");
      if (jsonSizeBytes > MAX_CHUNKS_JSON_SIZE) {
        throw new Error(
          `Chunks JSON too large: ${jsonSizeBytes} bytes (max: ${MAX_CHUNKS_JSON_SIZE})`,
        );
      }

      await updateFn({
        processingStatus: "completed",
        chunks: chunksJson,
        processingError: null,
      });

      console.log(
        `[DocumentProcessor] Resource ${resourceId} processed: ${chunks.length} chunks, ${(jsonSizeBytes / 1024).toFixed(1)}KB`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(
        `[DocumentProcessor] Failed to process resource ${resourceId}: ${errorMessage}`,
      );

      await updateFn({
        processingStatus: "failed",
        processingError: `Erreur: ${errorMessage}`,
      });
    }
  }
}

export const documentProcessor = new DocumentProcessor();
