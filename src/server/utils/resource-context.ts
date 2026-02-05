/**
 * Resource Context — loads the user's org resources and runs
 * semantic searches to build a personalised context block
 * that feeds into every YouTube analysis prompt.
 *
 * Search topics mirror the chat system's resource-search strategy
 * (see system-prompts.ts) so the analysis stays aligned with whatever
 * the user has already told the platform about their business.
 */

import { db } from "~/server/db";
import { documentProcessor } from "~/server/services/langchain-processor";
import type { ChunkWithEmbedding } from "~/server/services/langchain-processor";
import type { ResourceSnippet } from "./youtube-analyzer";

/** Fixed topics searched against every resource in the org. */
const SEARCH_TOPICS = [
  { topic: "Avatar Client", query: "avatar client persona cible audience" },
  {
    topic: "Objectifs Business",
    query: "objectifs business priorités croissance revenus",
  },
  {
    topic: "Guidelines Communication",
    query: "guidelines communication brand voice ton style",
  },
  {
    topic: "Positionnement",
    query: "positionnement marché niche stratégie différenciation",
  },
  {
    topic: "Stratégie Contenu",
    query: "stratégie contenu vidéo création marketing YouTube",
  },
];

const SIMILARITY_THRESHOLD = 0.25;
const MAX_SNIPPET_LENGTH = 300;

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Resolve active org — mirrors resources router logic. */
async function getOrganizationId(userId: string): Promise<string | null> {
  const session = await db.session.findFirst({
    where: { userId, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (session?.activeOrganizationId) return session.activeOrganizationId;

  const member = await db.member.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  return member?.organizationId ?? null;
}

/** Parse + validate a resource's chunks JSON, skipping corrupt entries. */
function parseChunks(chunksJson: string | null): ChunkWithEmbedding[] {
  if (!chunksJson) return [];
  try {
    const raw: unknown = JSON.parse(chunksJson);
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (item): item is ChunkWithEmbedding =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as Record<string, unknown>).text === "string" &&
        typeof (item as Record<string, unknown>).index === "number" &&
        Array.isArray((item as Record<string, unknown>).embedding),
    );
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// public
// ---------------------------------------------------------------------------

/**
 * Fetch personalised resource context for a user.
 *
 * 1. Resolves the user's active organisation.
 * 2. Loads every *completed* BusinessResource in that org.
 * 3. Runs 5 fixed semantic searches + an optional video-title query.
 * 4. Returns deduplicated snippets above the similarity threshold.
 *
 * Returns `[]` when the user has no org, no resources, or no matches.
 */
export async function fetchResourceContext(
  userId: string,
  videoTitle?: string,
): Promise<ResourceSnippet[]> {
  const organizationId = await getOrganizationId(userId);
  if (!organizationId) return [];

  const resources = await db.businessResource.findMany({
    where: { organizationId, processingStatus: "completed" },
    select: { id: true, title: true, chunks: true },
  });
  if (resources.length === 0) return [];

  // Flatten chunks, tagging each with its source resource title.
  // The extra `_source` key is invisible to semanticSearch (structural typing)
  // but survives in the returned chunk references so we can recover it.
  type TaggedChunk = ChunkWithEmbedding & { _source: string };
  const allChunks: TaggedChunk[] = [];
  for (const resource of resources) {
    for (const chunk of parseChunks(resource.chunks)) {
      allChunks.push({ ...chunk, _source: resource.title });
    }
  }
  if (allChunks.length === 0) return [];

  // Fixed topics + optional video-title query for content-specific matches
  const queries = [...SEARCH_TOPICS];
  if (videoTitle?.trim()) {
    queries.push({ topic: "Contexte vidéo", query: videoTitle });
  }

  const snippets: ResourceSnippet[] = [];
  const seenKeys = new Set<string>();

  for (const { topic, query } of queries) {
    const results = await documentProcessor.semanticSearch(query, allChunks, 3);
    for (const result of results) {
      if (result.similarity < SIMILARITY_THRESHOLD) continue;
      const key = result.chunk.text.substring(0, 100);
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      snippets.push({
        topic,
        content: result.chunk.text.substring(0, MAX_SNIPPET_LENGTH),
        source: (result.chunk as TaggedChunk)._source,
      });
    }
  }

  return snippets;
}
