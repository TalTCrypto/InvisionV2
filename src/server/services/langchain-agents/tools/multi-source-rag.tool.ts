import { z } from "zod";
import type { PrismaClient } from "../../../../../generated/prisma";
import { BaseTool } from "./base-tool";
import type { ToolExecutionContext } from "../types";
import type {
  DocumentProcessor,
  SearchResult,
} from "~/server/services/langchain-processor";

interface MultiSourceInput {
  query: string;
  sources?: Array<"resources" | "instagram" | "youtube">;
  topK?: number;
  recencyWeight?: number; // 0-1, how much to weight recent content
}

interface SourceResult {
  source: "resources" | "instagram" | "youtube";
  text: string;
  similarity: number;
  metadata?: {
    resourceName?: string;
    postUrl?: string;
    videoUrl?: string;
    createdAt?: string;
    metrics?: Record<string, unknown>;
  };
  score: number; // Final weighted score
}

interface MultiSourceOutput {
  results: SourceResult[];
  totalFound: number;
  sourceBreakdown: Record<string, number>;
}

/**
 * MultiSourceRAGTool - Recherche intelligente multi-sources
 *
 * Fusionne et pondère les résultats de plusieurs sources:
 * - Business Resources (documents, guides)
 * - Instagram Insights (posts, reels, stories analysés)
 * - YouTube Insights (vidéos analysées)
 *
 * Pondération basée sur:
 * - Similarité sémantique
 * - Fraîcheur des données (recency)
 * - Type de source (priorités configurables)
 */
export class MultiSourceRAGTool extends BaseTool<
  MultiSourceInput,
  MultiSourceOutput
> {
  readonly name = "multi_source_search";
  readonly description =
    "Recherche intelligente dans plusieurs sources (resources, Instagram insights, YouTube insights). Fusionne et pondère les résultats par pertinence et fraîcheur. Utilise cette fonction pour obtenir une vue complète des informations disponibles.";
  readonly schema = z.object({
    query: z.string().describe("Requête de recherche en langage naturel"),
    sources: z
      .array(z.enum(["resources", "instagram", "youtube"]))
      .optional()
      .describe(
        "Sources à interroger (par défaut: toutes). Options: resources, instagram, youtube",
      ),
    topK: z
      .number()
      .default(10)
      .describe("Nombre total de résultats à retourner (max 20)"),
    recencyWeight: z
      .number()
      .min(0)
      .max(1)
      .default(0.3)
      .describe(
        "Poids de la fraîcheur (0-1). Plus élevé = préfère le contenu récent",
      ),
  });
  readonly tags = ["search", "rag", "multi-source", "fusion"];

  constructor(
    private documentProcessor: DocumentProcessor,
    private db: PrismaClient,
  ) {
    super();
  }

  async execute(
    input: MultiSourceInput,
    context: ToolExecutionContext,
  ): Promise<MultiSourceOutput> {
    const sources = input.sources ?? ["resources", "instagram", "youtube"];
    const topK = Math.min(input.topK ?? 10, 20);
    const recencyWeight = input.recencyWeight ?? 0.3;

    const allResults: SourceResult[] = [];

    // Search in each source
    if (sources.includes("resources")) {
      const resourceResults = await this.searchResources(
        input.query,
        context.organizationId,
        topK * 2, // Get more results for filtering
      );
      allResults.push(...resourceResults);
    }

    if (sources.includes("instagram")) {
      const instagramResults = await this.searchInstagramInsights(
        input.query,
        context.organizationId,
        topK * 2,
      );
      allResults.push(...instagramResults);
    }

    if (sources.includes("youtube")) {
      const youtubeResults = await this.searchYouTubeInsights(
        input.query,
        context.organizationId,
        topK * 2,
      );
      allResults.push(...youtubeResults);
    }

    // Weight and score results
    const scoredResults = allResults.map((result) => {
      const recencyScore = this.calculateRecencyScore(
        result.metadata?.createdAt,
      );
      const finalScore =
        result.similarity * (1 - recencyWeight) + recencyScore * recencyWeight;

      return {
        ...result,
        score: finalScore,
      };
    });

    // Sort by final score and take topK
    const topResults = scoredResults
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    // Calculate source breakdown
    const sourceBreakdown = topResults.reduce(
      (acc, result) => {
        acc[result.source] = (acc[result.source] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      results: topResults,
      totalFound: allResults.length,
      sourceBreakdown,
    };
  }

  private async searchResources(
    query: string,
    organizationId: string,
    limit: number,
  ): Promise<SourceResult[]> {
    const resources = await this.db.businessResource.findMany({
      where: {
        organizationId,
        processingStatus: "completed",
      },
      select: {
        id: true,
        title: true,
        chunks: true,
        createdAt: true,
      },
      take: 50,
    });

    const allChunks = resources.flatMap(
      (resource: {
        id: string;
        title: string;
        chunks: string | null;
        createdAt: Date;
      }) => {
        if (!resource.chunks) return [];

        try {
          const parsed = JSON.parse(resource.chunks) as Array<{
            text: string;
            index: number;
            embedding: number[];
          }>;
          return parsed.map((chunk) => ({
            ...chunk,
            resourceName: resource.title,
            createdAt: resource.createdAt,
          }));
        } catch {
          return [];
        }
      },
    );

    if (allChunks.length === 0) {
      return [];
    }

    const searchResults = await this.documentProcessor.semanticSearch(
      query,
      allChunks,
      limit,
    );

    return searchResults.map((result: SearchResult) => ({
      source: "resources" as const,
      text: result.chunk.text,
      similarity: result.similarity,
      metadata: {
        resourceName: (result.chunk as { resourceName?: string }).resourceName,
        createdAt: (
          result.chunk as { createdAt?: Date }
        ).createdAt?.toISOString(),
      },
      score: result.similarity,
    }));
  }

  private async searchInstagramInsights(
    _query: string,
    _organizationId: string,
    _limit: number,
  ): Promise<SourceResult[]> {
    // TODO: Implémenter recherche dans Instagram insights une fois le modèle ajouté au schéma
    return [];
  }

  private async searchYouTubeInsights(
    _query: string,
    _organizationId: string,
    _limit: number,
  ): Promise<SourceResult[]> {
    // TODO: Implémenter recherche dans YouTube insights une fois le modèle ajouté au schéma
    return [];
  }

  private calculateRecencyScore(createdAt: string | undefined): number {
    if (!createdAt) return 0.5; // Default score for unknown date

    const now = new Date();
    const created = new Date(createdAt);
    const daysSinceCreation =
      (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);

    // Exponential decay: newer content scores higher
    // 1.0 for today, 0.9 for 7 days ago, 0.5 for 30 days ago
    const decayRate = 0.03; // Adjust this for faster/slower decay
    const score = Math.exp(-decayRate * daysSinceCreation);

    return Math.max(0, Math.min(1, score)); // Clamp between 0 and 1
  }
}
