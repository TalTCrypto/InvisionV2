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
    console.log(`[E2E setup] org created   → ${org.id}`);
  } else {
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

  await db.$disconnect();
  console.log("[E2E setup] done ✓\n");
}

void main();
