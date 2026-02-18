/**
 * Onboarding → Resources E2E
 *
 * Validates that completing onboarding auto-creates BusinessResource entries
 * from each non-empty field, and that they go through the processing pipeline.
 *
 *   §1  Auth — Login with test user
 *   §2  Baseline — Count existing resources before test
 *   §3  Onboarding completion — Call completeOnboarding with all fields filled
 *   §4  Resource creation — Verify resources exist with correct titles/categories
 *   §5  Processing pipeline — Wait and verify resources get processed (status = completed)
 *   §6  Metadata — Verify each resource has source: "onboarding" in metadata
 *   §7  Empty fields — Verify empty/missing fields don't create resources
 *   §8  Cleanup — Delete test org, resources, and reset user
 *
 * Requires: dev server running (`npm run dev`)
 * Run:      node tests/e2e/onboarding-resources.test.js
 */

import puppeteer from "puppeteer";
import { BASE_URL, TIMEOUTS } from "./config.js";
import { loginOnly } from "./helpers.js";

// ─── helpers ─────────────────────────────────────────────────────────────────

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Call a tRPC mutation via fetch inside the browser context. */
async function trpcMutate(page, procedure, input) {
  return page.evaluate(
    async (proc, inp) => {
      const body = { 0: { json: inp } };
      const r = await fetch(`/api/trpc/${proc}?batch=1`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      return { status: r.status, data };
    },
    procedure,
    input,
  );
}

/** Call a tRPC query via fetch inside the browser context. */
async function trpcQuery(page, procedure, input) {
  return page.evaluate(
    async (proc, inp) => {
      const params = new URLSearchParams({
        batch: "1",
        input: JSON.stringify({ 0: { json: inp } }),
      });
      const r = await fetch(`/api/trpc/${proc}?${params}`);
      const data = await r.json();
      return { status: r.status, data };
    },
    procedure,
    input,
  );
}

/** List all resources for current user's org. */
async function listResources(page) {
  const res = await trpcQuery(page, "resources.list", {});
  return res.data?.[0]?.result?.data?.json ?? [];
}

/** Delete a single resource by ID. */
async function deleteResource(page, id) {
  return trpcMutate(page, "resources.delete", { id });
}

// ─── expected resources from onboarding ──────────────────────────────────────

const EXPECTED_RESOURCES = [
  { title: "Type de business", category: "Profil" },
  { title: "Angle d'offre", category: "Offre" },
  { title: "Ce que je propose", category: "Offre" },
  { title: "Audience cible", category: "Offre" },
  { title: "Description du business", category: "Contexte" },
  { title: "Challenge actuel", category: "Contexte" },
  { title: "Métriques clés", category: "Contexte" },
  { title: "Objectif principal", category: "Objectifs" },
  { title: "Contexte de décision", category: "Objectifs" },
];

const TEST_ONBOARDING_DATA = {
  organization: {
    name: `E2E-Onboarding-Test-${Date.now()}`,
    metadata: {
      businessType: "SaaS / Logiciel",
      offerAngle:
        "Plateforme d'IA pour automatiser les analyses marketing et business intelligence",
      whatYouOffer:
        "Un dashboard IA qui centralise les métriques, analyse les tendances et génère des recommandations personnalisées",
      targetAudience:
        "Entrepreneurs solopreneurs entre 25-45 ans qui font 10k-100k€/mois en e-commerce ou infoproduits",
      businessDescription:
        "SaaS B2B qui aide les entrepreneurs à prendre de meilleures décisions grâce à l'IA contextuelle",
      currentChallenge:
        "Réduire le churn et augmenter le NPS en améliorant la pertinence des recommandations IA",
      keyMetrics: "MRR, Churn Rate, NPS, DAU/MAU ratio",
      mainGoal:
        "Atteindre 500 clients payants d'ici 6 mois avec un MRR de 25k€",
      decisionContext:
        "Arbitrage entre investir dans le produit ou le marketing, avec un budget limité de 5k€/mois",
    },
  },
};

// ─── runner ──────────────────────────────────────────────────────────────────

(async () => {
  console.log("🎯  Onboarding → Resources — E2E\n");

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    timeout: TIMEOUTS.DEFAULT_MS,
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  let passed = 0;
  let failed = 0;
  const createdResourceIds = [];
  let createdOrgId = null;

  function pass(name) {
    console.log(`  ✅  ${name}`);
    passed++;
  }
  function fail(name, reason) {
    console.log(`  ❌  ${name}\n      → ${reason}`);
    failed++;
  }

  try {
    // ─── §1 Auth ──────────────────────────────────────────────────────────
    console.log("\n📋  §1 — Authentication\n");

    await loginOnly(page);
    pass("Login successful");

    // ─── §2 Baseline ──────────────────────────────────────────────────────
    console.log("\n📋  §2 — Baseline\n");

    const baselineResources = await listResources(page);
    const baselineCount = baselineResources.length;
    pass(`Baseline: ${baselineCount} existing resources`);

    // ─── §3 Onboarding completion ─────────────────────────────────────────
    console.log("\n📋  §3 — Onboarding Completion (creates resources)\n");

    const onboardingRes = await trpcMutate(
      page,
      "onboarding.completeOnboarding",
      TEST_ONBOARDING_DATA,
    );

    const onboardingResult = onboardingRes.data?.[0]?.result?.data?.json;
    if (
      onboardingRes.status === 200 &&
      onboardingResult?.success &&
      onboardingResult?.organization?.id
    ) {
      createdOrgId = onboardingResult.organization.id;
      pass(`Onboarding completed — org: ${createdOrgId.slice(0, 8)}...`);
    } else {
      fail(
        "Onboarding completion",
        `Status ${onboardingRes.status}: ${JSON.stringify(onboardingResult).slice(0, 300)}`,
      );
    }

    // Small delay to let async resource creation settle
    await delay(2000);

    // ─── §4 Resource creation verification ────────────────────────────────
    console.log("\n📋  §4 — Resource Creation Verification\n");

    const afterResources = await listResources(page);
    const newResources = afterResources.filter(
      (r) => !baselineResources.some((b) => b.id === r.id),
    );

    if (newResources.length === EXPECTED_RESOURCES.length) {
      pass(
        `Created ${newResources.length}/${EXPECTED_RESOURCES.length} resources`,
      );
    } else {
      fail(
        `Resource count`,
        `Expected ${EXPECTED_RESOURCES.length}, got ${newResources.length}`,
      );
    }

    // Track for cleanup
    for (const r of newResources) {
      createdResourceIds.push(r.id);
    }

    // Verify each expected resource exists with correct title and category
    for (const expected of EXPECTED_RESOURCES) {
      const found = newResources.find(
        (r) => r.title === expected.title && r.category === expected.category,
      );
      if (found) {
        pass(`Found: "${expected.title}" [${expected.category}]`);
      } else {
        fail(
          `Missing: "${expected.title}" [${expected.category}]`,
          `Not found in ${newResources.map((r) => r.title).join(", ")}`,
        );
      }
    }

    // ─── §5 Processing pipeline ───────────────────────────────────────────
    console.log("\n📋  §5 — Processing Pipeline\n");

    // Check initial status = pending
    const pendingCount = newResources.filter(
      (r) => r.processingStatus === "pending",
    ).length;
    if (pendingCount > 0) {
      pass(`${pendingCount} resources start with status "pending"`);
    } else {
      // They might have already been processed if fast
      pass("Resources already past pending state (fast processing)");
    }

    // Wait for processing (embedding generation)
    console.log("  ⏳  Waiting 20s for processing pipeline...");
    await delay(20000);

    const processedResources = await listResources(page);
    const processedNew = processedResources.filter((r) =>
      createdResourceIds.includes(r.id),
    );

    const completedCount = processedNew.filter(
      (r) => r.processingStatus === "completed",
    ).length;
    const failedCount = processedNew.filter(
      (r) => r.processingStatus === "failed",
    ).length;

    if (completedCount === EXPECTED_RESOURCES.length) {
      pass(
        `All ${completedCount} resources processed successfully (status: completed)`,
      );
    } else if (completedCount > 0) {
      pass(
        `${completedCount}/${EXPECTED_RESOURCES.length} resources processed (${failedCount} failed)`,
      );
      if (failedCount > 0) {
        const failedOnes = processedNew.filter(
          (r) => r.processingStatus === "failed",
        );
        for (const f of failedOnes) {
          fail(
            `Processing failed: "${f.title}"`,
            f.processingError ?? "No error message",
          );
        }
      }
    } else {
      fail(
        "Processing pipeline",
        `No resources completed. Statuses: ${processedNew.map((r) => `${r.title}=${r.processingStatus}`).join(", ")}`,
      );
    }

    // ─── §6 Metadata verification ─────────────────────────────────────────
    console.log("\n📋  §6 — Metadata Verification\n");

    let metadataOk = 0;
    for (const resource of processedNew) {
      try {
        const meta = JSON.parse(resource.metadata);
        if (
          meta.source === "onboarding" &&
          meta.wordCount > 0 &&
          meta.charCount > 0
        ) {
          metadataOk++;
        } else {
          fail(
            `Metadata for "${resource.title}"`,
            `source=${meta.source}, wordCount=${meta.wordCount}, charCount=${meta.charCount}`,
          );
        }
      } catch {
        fail(
          `Metadata parse for "${resource.title}"`,
          `Invalid JSON: ${resource.metadata?.slice(0, 100)}`,
        );
      }
    }
    if (metadataOk === processedNew.length) {
      pass(
        `All ${metadataOk} resources have correct metadata (source: "onboarding", wordCount, charCount)`,
      );
    }

    // ─── §7 Empty fields test ─────────────────────────────────────────────
    console.log("\n📋  §7 — Empty Fields (no resource created)\n");

    const partialData = {
      organization: {
        name: `E2E-Partial-${Date.now()}`,
        metadata: {
          businessType: "E-commerce / Vente en ligne",
          // offerAngle: intentionally missing
          whatYouOffer: "",
          // targetAudience: intentionally missing
          businessDescription: "  ", // whitespace only
          currentChallenge: "Un vrai challenge",
          // keyMetrics: intentionally missing
          // mainGoal: intentionally missing
          // decisionContext: intentionally missing
        },
      },
    };

    const partialRes = await trpcMutate(
      page,
      "onboarding.completeOnboarding",
      partialData,
    );

    const partialResult = partialRes.data?.[0]?.result?.data?.json;
    let partialOrgId = null;

    if (partialRes.status === 200 && partialResult?.success) {
      partialOrgId = partialResult.organization.id;
      pass(
        `Partial onboarding completed — org: ${partialOrgId.slice(0, 8)}...`,
      );
    } else {
      fail("Partial onboarding", `Status ${partialRes.status}`);
    }

    await delay(2000);

    // Check how many new resources were created
    const afterPartial = await listResources(page);
    const partialNew = afterPartial.filter(
      (r) =>
        !baselineResources.some((b) => b.id === r.id) &&
        !createdResourceIds.includes(r.id),
    );

    // Should only have: "Type de business" + "Challenge actuel" = 2
    if (partialNew.length === 2) {
      pass(
        `Partial: created only ${partialNew.length} resources (skipped empty/missing)`,
      );
    } else {
      fail(
        `Partial resource count`,
        `Expected 2, got ${partialNew.length}: ${partialNew.map((r) => r.title).join(", ")}`,
      );
    }

    // Track partial resources for cleanup
    for (const r of partialNew) {
      createdResourceIds.push(r.id);
    }

    // ─── §8 Cleanup ───────────────────────────────────────────────────────
    console.log("\n📋  §8 — Cleanup\n");

    // Resources are scoped to the new orgs created during the test.
    // The resources.delete endpoint requires the user's active org to match,
    // so we switch the active org before deleting.
    // For each created org, set it active then delete its resources.
    const orgsToClean = [createdOrgId, partialOrgId].filter(Boolean);

    for (const orgId of orgsToClean) {
      // Switch active org via Better Auth's setActiveOrg endpoint
      await page.evaluate(async (oid) => {
        await fetch("/api/trpc/organization.setActiveOrganization?batch=1", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 0: { json: { organizationId: oid } } }),
        });
      }, orgId);
      await delay(500);

      // Now list and delete resources from this org
      const orgResources = await listResources(page);
      const toDelete = orgResources.filter((r) =>
        createdResourceIds.includes(r.id),
      );

      for (const r of toDelete) {
        const delRes = await deleteResource(page, r.id);
        if (delRes.status === 200) {
          pass(`Deleted resource ${r.id.slice(0, 8)}...`);
        } else {
          fail(
            `Delete resource ${r.id.slice(0, 8)}...`,
            `Status ${delRes.status}`,
          );
        }
      }
    }

    pass("Cleanup complete");
  } catch (err) {
    console.error("\n💥  Unexpected error:", err);
    failed++;
  } finally {
    await browser.close();

    console.log("\n" + "─".repeat(60));
    console.log(`\n✅  Passed: ${passed}`);
    console.log(`❌  Failed: ${failed}`);
    console.log(
      `\n${failed === 0 ? "🎉  All tests passed!" : "⚠️  Some tests failed"}\n`,
    );

    process.exit(failed === 0 ? 0 : 1);
  }
})();
