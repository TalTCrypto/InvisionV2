import { OpenAIEmbeddings } from "@langchain/openai";
import { env } from "~/env";

// Security limits
const MAX_CHUNK_SIZE = 10000; // Max characters per chunk
const MAX_CHUNKS_JSON_SIZE = 10 * 1024 * 1024; // 10MB max for serialized chunks
const MAX_CONTENT_SIZE = 1000000; // 1M chars max input (~ 250k words)

export interface Chunk {
  text: string;
  index: number;
}

export interface ChunkWithEmbedding extends Chunk {
  embedding: number[];
}

export interface SearchResult {
  chunk: ChunkWithEmbedding;
  similarity: number;
}

export class DocumentProcessor {
  private embeddings: OpenAIEmbeddings;

  constructor() {
    this.embeddings = new OpenAIEmbeddings({
      openAIApiKey: env.OPENAI_API_KEY,
      modelName: "text-embedding-3-small",
    });
  }

  async chunkDocument(content: string): Promise<Chunk[]> {
    const chunkSize = 1500;
    const chunkOverlap = 200;
    const chunks: Chunk[] = [];

    const paragraphs = content.split(/\n\n+/);
    let currentChunk = "";
    let chunkIndex = 0;

    for (const paragraph of paragraphs) {
      // Security: Skip paragraphs that are too large
      if (paragraph.length > MAX_CHUNK_SIZE) {
        console.warn(
          `[DocumentProcessor] Skipping oversized paragraph (${paragraph.length} chars)`,
        );
        continue;
      }

      if (
        currentChunk.length + paragraph.length > chunkSize &&
        currentChunk.length > 0
      ) {
        const trimmedChunk = currentChunk.trim();

        // Security: Validate chunk size before adding
        if (trimmedChunk.length <= MAX_CHUNK_SIZE) {
          chunks.push({
            text: trimmedChunk,
            index: chunkIndex++,
          });
        }

        const overlapText = currentChunk.slice(-chunkOverlap);
        currentChunk = overlapText + " " + paragraph;
      } else {
        currentChunk += (currentChunk ? "\n\n" : "") + paragraph;
      }
    }

    if (currentChunk.trim()) {
      const trimmedChunk = currentChunk.trim();

      // Security: Validate final chunk size
      if (trimmedChunk.length <= MAX_CHUNK_SIZE) {
        chunks.push({
          text: trimmedChunk,
          index: chunkIndex,
        });
      }
    }

    return chunks;
  }

  async generateEmbeddings(chunks: Chunk[]): Promise<ChunkWithEmbedding[]> {
    const texts = chunks.map((chunk) => chunk.text);
    const embeddings = await this.embeddings.embedDocuments(texts);

    return chunks.map((chunk, index) => ({
      ...chunk,
      embedding: embeddings[index] ?? [],
    }));
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
      // Security: Validate content size before processing
      if (content.length > MAX_CONTENT_SIZE) {
        throw new Error(
          `Content too large: ${content.length} chars (max: ${MAX_CONTENT_SIZE})`,
        );
      }

      await updateFn({ processingStatus: "processing" });

      const chunks = await this.chunkDocument(content);

      // Security: Validate we have chunks
      if (chunks.length === 0) {
        throw new Error("No valid chunks generated from content");
      }

      const chunksWithEmbeddings = await this.generateEmbeddings(chunks);
      const chunksJson = JSON.stringify(chunksWithEmbeddings);

      // Security: Validate JSON size before storing
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
    } catch (error) {
      // Security: Log generic error without sensitive details
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(
        `[DocumentProcessor] Failed to process resource ${resourceId}: ${errorMessage}`,
      );

      await updateFn({
        processingStatus: "failed",
        processingError: "Erreur lors du traitement du document",
      });
    }
  }
}

export const documentProcessor = new DocumentProcessor();
