import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { BaseTool } from "./base-tool";
import type { ToolExecutionContext } from "../types";
import type {
  DocumentProcessor,
  SearchResult,
} from "~/server/services/langchain-processor";

interface ResourceSearchInput {
  query: string;
  category?: string;
  topK?: number;
}

interface ResourceSearchOutput {
  results: Array<{
    text: string;
    similarity: number;
    resourceName?: string;
  }>;
  totalFound: number;
}

export class ResourceSearchTool extends BaseTool<
  ResourceSearchInput,
  ResourceSearchOutput
> {
  readonly name = "search_business_resources";
  readonly description =
    "Recherche sémantique dans les ressources business de l'organisation (documents, guides, templates). Utilise cette fonction pour trouver des informations pertinentes dans la base de connaissances.";
  readonly schema = z.object({
    query: z
      .string()
      .describe("Requête de recherche en langage naturel"),
    category: z
      .string()
      .optional()
      .describe("Filtrer par catégorie de ressource"),
    topK: z
      .number()
      .default(5)
      .describe("Nombre de résultats à retourner (max 10)"),
  });
  readonly tags = ["search", "resources", "knowledge", "documents"];

  constructor(
    private documentProcessor: DocumentProcessor,
    private db: PrismaClient,
  ) {
    super();
  }

  async execute(
    input: ResourceSearchInput,
    context: ToolExecutionContext,
  ): Promise<ResourceSearchOutput> {
    const topK = Math.min(input.topK ?? 5, 10);

    const resourcesQuery = {
      where: {
        organizationId: context.organizationId,
        processingStatus: "completed",
        ...(input.category ? { category: input.category } : {}),
      },
      select: {
        id: true,
        title: true,
        chunks: true,
      },
    };

    const resources =
      await this.db.businessResource.findMany(resourcesQuery);

    if (resources.length === 0) {
      return {
        results: [],
        totalFound: 0,
      };
    }

    const allChunks = resources.flatMap((resource: { id: string; title: string; chunks: string | null; }) => {
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
        }));
      } catch {
        return [];
      }
    });

    if (allChunks.length === 0) {
      return {
        results: [],
        totalFound: 0,
      };
    }

    const searchResults = await this.documentProcessor.semanticSearch(
      input.query,
      allChunks,
      topK,
    );

    return {
      results: searchResults.map((result: SearchResult) => ({
        text: result.chunk.text,
        similarity: Math.round(result.similarity * 100) / 100,
        resourceName: (result.chunk as { resourceName?: string }).resourceName,
      })),
      totalFound: searchResults.length,
    };
  }
}
