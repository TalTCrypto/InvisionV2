/**
 * Auto-creates BusinessResource entries from onboarding metadata.
 *
 * Each non-empty text field becomes its own resource, processed through
 * the same chunking + embedding pipeline as manually-created resources.
 *
 * The frontend sends onboarding fields flat at the root of `metadata`
 * (e.g. `metadata.businessType`, not `metadata.avatar.businessType`).
 */

import type { PrismaClient } from "../../../generated/prisma";
import { documentProcessor } from "~/server/services/langchain-processor";

/** One onboarding field → one resource. */
interface OnboardingResourceField {
  readonly key: string;
  readonly title: string;
  readonly category: string;
}

export const ONBOARDING_RESOURCE_FIELDS: readonly OnboardingResourceField[] = [
  { key: "businessType", title: "Type de business", category: "Profil" },
  { key: "offerAngle", title: "Angle d'offre", category: "Offre" },
  { key: "whatYouOffer", title: "Ce que je propose", category: "Offre" },
  { key: "targetAudience", title: "Audience cible", category: "Offre" },
  {
    key: "businessDescription",
    title: "Description du business",
    category: "Contexte",
  },
  {
    key: "currentChallenge",
    title: "Challenge actuel",
    category: "Contexte",
  },
  { key: "keyMetrics", title: "Métriques clés", category: "Contexte" },
  { key: "mainGoal", title: "Objectif principal", category: "Objectifs" },
  {
    key: "decisionContext",
    title: "Contexte de décision",
    category: "Objectifs",
  },
];

/**
 * Create BusinessResource entries from onboarding metadata.
 *
 * Skips fields that are empty / missing.
 * Launches document processing (chunking + embedding) asynchronously.
 *
 * @returns Number of resources created.
 */
export async function createResourcesFromOnboarding(
  db: PrismaClient,
  params: {
    userId: string;
    organizationId: string;
    metadata: Record<string, unknown>;
  },
): Promise<number> {
  const { userId, organizationId, metadata } = params;
  let created = 0;

  for (const field of ONBOARDING_RESOURCE_FIELDS) {
    const value = metadata[field.key];
    if (typeof value !== "string" || value.trim().length === 0) continue;

    const content = value.trim();

    const resource = await db.businessResource.create({
      data: {
        title: field.title,
        category: field.category,
        content,
        userId,
        organizationId,
        processingStatus: "pending",
        metadata: JSON.stringify({
          wordCount: content.split(/\s+/).length,
          charCount: content.length,
          source: "onboarding",
        }),
      },
    });

    // Same async pipeline as resources.create — fire and forget
    void documentProcessor.processResource(
      resource.id,
      resource.content,
      async (data) => {
        await db.businessResource.update({
          where: { id: resource.id },
          data,
        });
      },
    );

    created++;
  }

  return created;
}
