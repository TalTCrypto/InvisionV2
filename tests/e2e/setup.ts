/**
 * Idempotent E2E fixture setup.
 *
 * Creates (if missing) the dedicated test user, an organisation it owns,
 * and marks onboarding as completed — everything the chat-v2 route needs
 * before it will serve a response.
 *
 * Run standalone:   npx tsx tests/e2e/setup.ts
 * Called automatically by:  npm run test:e2e
 */

import { PrismaClient } from "../../generated/prisma/index.js";
import { scryptAsync } from "@noble/hashes/scrypt.js";
import { hex } from "@better-auth/utils/hex";

const db = new PrismaClient();

const EMAIL = "e2e@invision.test";
const PASSWORD = "Passw0rd123!";
const NAME = "E2EBot";

async function hashPassword(password: string): Promise<string> {
  const salt = hex.encode(crypto.getRandomValues(new Uint8Array(16)));
  const key = await scryptAsync(password.normalize("NFKC"), salt, {
    N: 16384,
    r: 16,
    p: 1,
    dkLen: 64,
    maxmem: 128 * 16384 * 16 * 2,
  });
  return `${salt}:${hex.encode(key)}`;
}

async function main() {
  console.log("[E2E setup] checking test fixtures…");

  // ── user ──────────────────────────────────────────────────────────────────
  let user = await db.user.findUnique({ where: { email: EMAIL } });

  if (!user) {
    console.log("[E2E setup] creating user…");
    const hashedPassword = await hashPassword(PASSWORD);
    user = await db.user.create({
      data: {
        email: EMAIL,
        name: NAME,
        emailVerified: true,
        role: "user",
        accounts: {
          create: {
            accountId: EMAIL,
            providerId: "credential",
            password: hashedPassword,
          },
        },
      },
    });
    console.log(`[E2E setup] user created  → ${user.id}`);
  } else {
    console.log(`[E2E setup] user exists   → ${user.id}`);
  }

  // ── organisation + membership ─────────────────────────────────────────────
  const member = await db.member.findFirst({ where: { userId: user.id } });
  let organizationId: string;

  if (!member) {
    console.log("[E2E setup] creating organisation…");
    const org = await db.organization.create({
      data: {
        name: "E2E Test Org",
        slug: `e2e-test-org-${Date.now()}`,
      },
    });
    await db.member.create({
      data: { organizationId: org.id, userId: user.id, role: "owner" },
    });
    organizationId = org.id;
    console.log(`[E2E setup] org created   → ${org.id}`);
  } else {
    organizationId = member.organizationId;
    console.log("[E2E setup] org exists");
  }

  // ── onboarding flag ───────────────────────────────────────────────────────
  if (!user.onboardingCompleted) {
    await db.user.update({
      where: { id: user.id },
      data: { onboardingCompleted: true },
    });
    console.log("[E2E setup] onboarding    → completed");
  }

  // ── test BusinessResource with embeddings ────────────────────────────────
  const E2E_RESOURCE_TITLE = "E2E Test Resource";
  const existingResource = await db.businessResource.findFirst({
    where: { organizationId, title: E2E_RESOURCE_TITLE },
  });

  if (!existingResource) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.log(
        "[E2E setup] OPENAI_API_KEY missing — skipping resource creation",
      );
    } else {
      console.log(
        "[E2E setup] creating test BusinessResource with embeddings…",
      );

      const chunks = [
        "Notre avatar client est un entrepreneur solo ou dirigeant de petite entreprise, agé de 30 à 45 ans, qui cherche à développer sa présence en ligne et à générer du chiffre d'affaires via du contenu vidéo YouTube. Il est actif sur les réseaux sociaux et consomme régulièrement du contenu éducatif.",
        "Les objectifs business principaux sont: augmenter le nombre d'abonnés YouTube de 50% en 6 mois, générer 10k€ de revenus mensuels via des formations en ligne, et établir une autorité reconnue dans le domaine du marketing digital pour les TPE/PME.",
        "La brand voice doit être professionnelle mais accessible, encourageante sans être condescendante. Le ton est celui d'un mentor bienveillant. Les communications utilisent un français clair, évitent le jargon technique excessif, et privilègient les exemples concrets et chiffres réels.",
        "Le positionnement marché se concentre sur la niche 'marketing digital pour entrepreneurs indépendants'. Notre différenciation est de proposer des stratégies adaptées aux budgets limités, contrairement aux agences qui ciblent les grandes entreprises. On est l'alternative accessible et actionnable.",
        "La stratégie contenu vidéo YouTube repose sur 3 pilliers: tutorials pratiques (60%), études de cas avec chiffres réels (25%), et contenus inspirationnels sur l'entrepreneuriat (15%). Chaque vidéo doit délivrer une valeur concrète en moins de 15 minutes et se terminer par un CTA vers une formation gratuite.",
      ];

      // Generate embeddings via OpenAI API
      const embRes = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: chunks,
          model: "text-embedding-3-small",
        }),
      });

      if (!embRes.ok) {
        console.error("[E2E setup] Embeddings API error:", await embRes.text());
      } else {
        const embData = (await embRes.json()) as {
          data: Array<{ embedding: number[] }>;
        };
        const chunksWithEmbeddings = chunks.map((text, index) => ({
          text,
          index,
          embedding: embData.data[index]!.embedding,
        }));

        await db.businessResource.create({
          data: {
            userId: user.id,
            organizationId,
            title: E2E_RESOURCE_TITLE,
            category: "strategy",
            content: chunks.join("\n\n"),
            processingStatus: "completed",
            chunks: JSON.stringify(chunksWithEmbeddings),
          },
        });
        console.log("[E2E setup] resource created → " + E2E_RESOURCE_TITLE);
      }
    }
  } else {
    console.log("[E2E setup] resource exists  → " + E2E_RESOURCE_TITLE);
  }

  await db.$disconnect();
  console.log("[E2E setup] done ✓\n");
}

void main();
