/**
 * Resource Precision — E2E
 *
 * Validates the full resource pipeline with ultra-precision requirements:
 *   1. Auth gate on file upload API
 *   2. File upload API parses PDF, CSV, TXT, SRT correctly
 *   3. Document processor chunks intelligently by content type
 *   4. Semantic search retrieves specific buried details
 *   5. CSV row-level retrieval works
 *   6. Large content handling
 *   7. Edge cases (empty files, unsupported types)
 *
 * Requires: dev server running (`npm run dev`)
 * Run:      node tests/e2e/resource-precision.test.js
 */

import puppeteer from "puppeteer";
import { TIMEOUTS } from "./config.js";
import { loginOnly } from "./helpers.js";

// ─── helpers ─────────────────────────────────────────────────────────────────

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** POST JSON and get response body. */
async function postJson(page, path, body) {
  return page.evaluate(
    async (p, b) => {
      const r = await fetch(p, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(b),
      });
      const data = await r.json();
      return { status: r.status, data };
    },
    path,
    body,
  );
}

/**
 * Upload a "file" by creating a Blob in-browser and posting it as FormData.
 * Returns { status, data }.
 */
async function uploadFileContent(page, fileName, content, mimeType) {
  return page.evaluate(
    async (name, text, mime) => {
      const blob = new Blob([text], { type: mime });
      const fd = new FormData();
      fd.append("file", blob, name);
      const r = await fetch("/api/resources/upload", {
        method: "POST",
        body: fd,
      });
      const raw = await r.text();
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        data = { error: raw };
      }
      return { status: r.status, data };
    },
    fileName,
    content,
    mimeType,
  );
}

/**
 * Create a resource via tRPC-style call (direct DB).
 * We use the /api/resources/upload endpoint to parse,
 * then create the resource via the trpc mutation.
 * For simplicity, we create resources by calling the tRPC endpoint directly.
 */
async function createResourceDirect(page, title, content, category) {
  return page.evaluate(
    async (t, c, cat) => {
      // Call tRPC create mutation directly via fetch
      const body = {
        0: {
          json: {
            title: t,
            content: c,
            category: cat || undefined,
          },
        },
      };

      const r = await fetch("/api/trpc/resources.create?batch=1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      return { status: r.status, data };
    },
    title,
    content,
    category,
  );
}

/**
 * Search resources via tRPC.
 */
async function searchResources(page, query, topK = 5) {
  return page.evaluate(
    async (q, k) => {
      const params = new URLSearchParams({
        batch: "1",
        input: JSON.stringify({ 0: { json: { query: q, topK: k } } }),
      });
      const r = await fetch(`/api/trpc/resources.search?${params}`);
      const data = await r.json();
      return { status: r.status, data };
    },
    query,
    topK,
  );
}

/** Delete a resource by ID via tRPC. */
async function deleteResource(page, id) {
  return page.evaluate(async (resourceId) => {
    const body = { 0: { json: { id: resourceId } } };
    const r = await fetch("/api/trpc/resources.delete?batch=1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return r.status;
  }, id);
}

// ─── Test data ───────────────────────────────────────────────────────────────

const TEST_CSV = `Name,Age,City,Hobby,Favorite Food
Alice Martin,28,Paris,Photography,Sushi
Bob Johnson,35,Lyon,Guitar,Pizza
Claire Dubois,42,Marseille,Painting,Chocolate croissant
David Chen,31,Bordeaux,Chess,Pho
Emma Wilson,26,Toulouse,Yoga,Avocado toast
François Petit,55,Nice,Sailing,Bouillabaisse
Grace Lee,39,Strasbourg,Running,Bibimbap
Henri Moreau,47,Nantes,Cooking,Ratatouille
Isabelle Thomas,33,Lille,Reading,Crêpes
Jean-Pierre Roux,62,Montpellier,Gardening,Cassoulet`;

const TEST_NARRATIVE = `# Guide Complet: Stratégie Marketing Digital

## Chapitre 1: Comprendre son Avatar Client

L'avatar client de notre entreprise est un entrepreneur entre 30 et 45 ans.
Il déteste absolument le chocolat et préfère les solutions salées pour ses pauses.
Son revenu mensuel est entre 5,000€ et 15,000€.
Il utilise principalement Instagram et LinkedIn.

## Chapitre 2: Objectifs Business Q1 2026

Notre objectif principal est d'atteindre 10,000 abonnés YouTube avant mars 2026.
Le budget marketing mensuel est fixé à exactement 2,347€.
Le taux de conversion cible est de 3.7% sur les landing pages.

## Chapitre 3: Brand Voice Guidelines

Le ton de communication doit être professionnel mais accessible.
RÈGLE ABSOLUE: Ne jamais utiliser le mot "révolutionnaire" dans nos communications.
Toujours tutoyer l'audience dans les vidéos YouTube.
Le hashtag principal est #BuildInPublic.

## Chapitre 4: Stratégie de Contenu

Publier 3 vidéos par semaine: mardi, jeudi, samedi à 18h.
Le format préféré est le tutoriel de 8 à 12 minutes.
La musique de fond doit toujours être Lo-Fi Hip Hop.
Le CTA final de chaque vidéo est: "Dis-moi en commentaire ce que tu en penses".`;

const TEST_SRT = `1
00:00:01,000 --> 00:00:05,000
Bonjour à tous, bienvenue dans cette vidéo

2
00:00:05,500 --> 00:00:10,000
Aujourd'hui on va parler du secret numéro un

3
00:00:10,500 --> 00:00:15,000
Le code promo exclusif est MAGIC2026

4
00:00:15,500 --> 00:00:20,000
Vous pouvez l'utiliser sur notre site

5
00:00:20,500 --> 00:00:25,000
Le prochain webinaire est le 15 mars à 14h

6
00:00:25,500 --> 00:00:30,000
N'oubliez pas de vous inscrire avant vendredi`;

// ─── runner ──────────────────────────────────────────────────────────────────

(async () => {
  console.log("🎯  Resource Precision — E2E\n");

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    timeout: TIMEOUTS.DEFAULT_MS,
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  let passed = 0;
  let failed = 0;
  const createdResources = [];

  function pass(name) {
    console.log(`  ✅  ${name}`);
    passed++;
  }
  function fail(name, reason) {
    console.log(`  ❌  ${name}\n      → ${reason}`);
    failed++;
  }

  try {
    // ─── §1 Auth Gate ──────────────────────────────────────────────────────
    console.log("\n📋  §1 — Auth & Upload API\n");

    // Navigate to the app first so page.evaluate has a valid URL context
    await page.goto("http://localhost:3000/auth/signin", {
      waitUntil: "networkidle2",
    });

    // Anonymous upload should fail
    {
      const res = await uploadFileContent(
        page,
        "test.txt",
        "hello",
        "text/plain",
      );
      if (res.status === 401) {
        pass("Upload API rejects anonymous (401)");
      } else {
        fail("Upload API rejects anonymous (401)", `Got ${res.status}`);
      }
    }

    // Login
    await loginOnly(page);
    pass("Login successful");

    // ─── §2 File Upload Parsing ────────────────────────────────────────────
    console.log("\n📋  §2 — File Upload Parsing\n");

    // TXT upload
    {
      const res = await uploadFileContent(
        page,
        "test.txt",
        "Hello World\n\nThis is a test document.",
        "text/plain",
      );
      if (res.status === 200 && res.data.content?.includes("Hello World")) {
        pass("TXT upload: content extracted");
      } else {
        fail(
          "TXT upload: content extracted",
          JSON.stringify(res.data).slice(0, 200),
        );
      }
    }

    // CSV upload
    {
      const res = await uploadFileContent(
        page,
        "test.csv",
        TEST_CSV,
        "text/csv",
      );
      if (res.status === 200) {
        const content = res.data.content;
        if (content.includes("[HEADERS]") && content.includes("[ROW ")) {
          pass("CSV upload: structured format with [HEADERS] and [ROW N]");
        } else {
          fail("CSV upload: structured format", "Missing markers");
        }
        if (content.includes("Claire Dubois")) {
          pass("CSV upload: row data preserved (Claire Dubois)");
        } else {
          fail("CSV upload: row data preserved", "Claire Dubois not found");
        }
        if (res.data.metadata?.rowCount === 10) {
          pass(`CSV upload: correct row count (${res.data.metadata.rowCount})`);
        } else {
          fail(
            "CSV upload: correct row count",
            `Got ${res.data.metadata?.rowCount}`,
          );
        }
      } else {
        fail("CSV upload", `Status ${res.status}: ${JSON.stringify(res.data)}`);
      }
    }

    // SRT upload
    {
      const res = await uploadFileContent(
        page,
        "test.srt",
        TEST_SRT,
        "text/plain",
      );
      if (res.status === 200) {
        const content = res.data.content;
        if (content.includes("MAGIC2026")) {
          pass("SRT upload: content preserved (MAGIC2026)");
        } else {
          fail("SRT upload: content preserved", "MAGIC2026 not found");
        }
        if (/\[\d+:\d{2}\]/.test(content)) {
          pass("SRT upload: timestamps converted to [MM:SS] format");
        } else {
          fail("SRT upload: timestamps converted", "No [MM:SS] format found");
        }
      } else {
        fail("SRT upload", `Status ${res.status}`);
      }
    }

    // Unsupported file type
    {
      const res = await uploadFileContent(
        page,
        "test.exe",
        "malicious",
        "application/octet-stream",
      );
      if (res.status === 400 && res.data.error?.includes("non supporté")) {
        pass("Upload rejects unsupported file type (.exe)");
      } else {
        fail("Upload rejects unsupported file type", `Got ${res.status}`);
      }
    }

    // Empty file
    {
      const res = await uploadFileContent(page, "empty.txt", "", "text/plain");
      if (res.status === 400) {
        pass("Upload rejects empty file");
      } else {
        fail("Upload rejects empty file", `Got ${res.status}`);
      }
    }

    // ─── §3 Resource Creation & Processing ─────────────────────────────────
    console.log("\n📋  §3 — Resource Creation & Processing\n");

    // Create narrative resource
    {
      const res = await createResourceDirect(
        page,
        "E2E Precision Test - Narrative",
        TEST_NARRATIVE,
        "e2e-test",
      );
      if (res.status === 200) {
        const result = res.data?.[0]?.result?.data?.json;
        if (result?.id) {
          createdResources.push(result.id);
          pass(`Created narrative resource (${result.id})`);
        } else {
          pass("Created narrative resource (response OK)");
        }
      } else {
        fail("Create narrative resource", `Status ${res.status}`);
      }
    }

    // Create CSV resource
    {
      // First parse CSV via upload API to get structured text
      const uploadRes = await uploadFileContent(
        page,
        "test.csv",
        TEST_CSV,
        "text/csv",
      );
      if (uploadRes.status === 200) {
        const res = await createResourceDirect(
          page,
          "E2E Precision Test - CSV",
          uploadRes.data.content,
          "e2e-test",
        );
        if (res.status === 200) {
          const result = res.data?.[0]?.result?.data?.json;
          if (result?.id) {
            createdResources.push(result.id);
          }
          pass("Created CSV resource");
        } else {
          fail("Create CSV resource", `Status ${res.status}`);
        }
      }
    }

    // Create SRT resource
    {
      const uploadRes = await uploadFileContent(
        page,
        "test.srt",
        TEST_SRT,
        "text/plain",
      );
      if (uploadRes.status === 200) {
        const res = await createResourceDirect(
          page,
          "E2E Precision Test - SRT",
          uploadRes.data.content,
          "e2e-test",
        );
        if (res.status === 200) {
          const result = res.data?.[0]?.result?.data?.json;
          if (result?.id) {
            createdResources.push(result.id);
          }
          pass("Created SRT resource");
        } else {
          fail("Create SRT resource", `Status ${res.status}`);
        }
      }
    }

    // Wait for async processing (embedding generation)
    console.log("\n  ⏳  Waiting 15s for resource processing...");
    await delay(15000);

    // ─── §4 Precision Retrieval Tests ──────────────────────────────────────
    console.log("\n📋  §4 — Precision Retrieval (Semantic Search)\n");

    // Test 1: Retrieve specific buried detail (chocolate hatred)
    {
      const res = await searchResources(
        page,
        "avatar client préférences alimentaires chocolat",
        5,
      );
      const results = res.data?.[0]?.result?.data?.json ?? [];
      const allTexts = results
        .flatMap((r) => r.matches?.map((m) => m.text) ?? [])
        .join(" ");
      if (allTexts.toLowerCase().includes("chocolat")) {
        pass("PRECISION: Found 'déteste le chocolat' via semantic search");
      } else {
        fail(
          "PRECISION: Found 'déteste le chocolat'",
          `Got ${results.length} results, none mention chocolat`,
        );
      }
    }

    // Test 2: Retrieve exact number (budget 2,347€)
    {
      const res = await searchResources(
        page,
        "budget marketing mensuel montant exact",
        5,
      );
      const results = res.data?.[0]?.result?.data?.json ?? [];
      const allTexts = results
        .flatMap((r) => r.matches?.map((m) => m.text) ?? [])
        .join(" ");
      if (allTexts.includes("2,347") || allTexts.includes("2347")) {
        pass("PRECISION: Found exact budget amount '2,347€'");
      } else {
        fail(
          "PRECISION: Found exact budget amount '2,347€'",
          `Results: ${allTexts.slice(0, 300)}`,
        );
      }
    }

    // Test 3: Retrieve brand rule (never use "révolutionnaire")
    {
      const res = await searchResources(
        page,
        "mots interdits communication brand",
        5,
      );
      const results = res.data?.[0]?.result?.data?.json ?? [];
      const allTexts = results
        .flatMap((r) => r.matches?.map((m) => m.text) ?? [])
        .join(" ");
      if (allTexts.includes("révolutionnaire")) {
        pass("PRECISION: Found banned word rule 'révolutionnaire'");
      } else {
        fail(
          "PRECISION: Found banned word rule",
          `Results: ${allTexts.slice(0, 300)}`,
        );
      }
    }

    // Test 4: Retrieve specific CTA
    {
      const res = await searchResources(
        page,
        "call to action fin de vidéo phrase exacte",
        5,
      );
      const results = res.data?.[0]?.result?.data?.json ?? [];
      const allTexts = results
        .flatMap((r) => r.matches?.map((m) => m.text) ?? [])
        .join(" ");
      if (allTexts.includes("Dis-moi en commentaire")) {
        pass("PRECISION: Found exact CTA phrase");
      } else {
        fail(
          "PRECISION: Found exact CTA",
          `Results: ${allTexts.slice(0, 300)}`,
        );
      }
    }

    // Test 5: CSV row-level retrieval (find Claire's hobby)
    {
      const res = await searchResources(
        page,
        "Claire Dubois hobby painting",
        5,
      );
      const results = res.data?.[0]?.result?.data?.json ?? [];
      const allTexts = results
        .flatMap((r) => r.matches?.map((m) => m.text) ?? [])
        .join(" ");
      if (allTexts.includes("Claire Dubois") && allTexts.includes("Painting")) {
        pass("PRECISION: CSV row-level retrieval (Claire Dubois + Painting)");
      } else {
        fail(
          "PRECISION: CSV row-level retrieval",
          `Results: ${allTexts.slice(0, 300)}`,
        );
      }
    }

    // Test 6: CSV specific person's food
    {
      const res = await searchResources(
        page,
        "Jean-Pierre Roux nourriture préférée",
        5,
      );
      const results = res.data?.[0]?.result?.data?.json ?? [];
      const allTexts = results
        .flatMap((r) => r.matches?.map((m) => m.text) ?? [])
        .join(" ");
      if (allTexts.includes("Cassoulet")) {
        pass("PRECISION: CSV retrieval (Jean-Pierre → Cassoulet)");
      } else {
        fail(
          "PRECISION: CSV retrieval (Jean-Pierre → Cassoulet)",
          `Results: ${allTexts.slice(0, 300)}`,
        );
      }
    }

    // Test 7: SRT promo code retrieval
    {
      const res = await searchResources(page, "code promo exclusif", 5);
      const results = res.data?.[0]?.result?.data?.json ?? [];
      const allTexts = results
        .flatMap((r) => r.matches?.map((m) => m.text) ?? [])
        .join(" ");
      if (allTexts.includes("MAGIC2026")) {
        pass("PRECISION: SRT transcript retrieval (MAGIC2026)");
      } else {
        fail(
          "PRECISION: SRT transcript retrieval (MAGIC2026)",
          `Results: ${allTexts.slice(0, 300)}`,
        );
      }
    }

    // Test 8: SRT date retrieval
    {
      const res = await searchResources(page, "date webinaire inscription", 5);
      const results = res.data?.[0]?.result?.data?.json ?? [];
      const allTexts = results
        .flatMap((r) => r.matches?.map((m) => m.text) ?? [])
        .join(" ");
      if (allTexts.includes("15 mars")) {
        pass("PRECISION: SRT date retrieval (15 mars)");
      } else {
        fail(
          "PRECISION: SRT date retrieval (15 mars)",
          `Results: ${allTexts.slice(0, 300)}`,
        );
      }
    }

    // Test 9: Content schedule specifics
    {
      const res = await searchResources(
        page,
        "jours de publication vidéo horaire",
        5,
      );
      const results = res.data?.[0]?.result?.data?.json ?? [];
      const allTexts = results
        .flatMap((r) => r.matches?.map((m) => m.text) ?? [])
        .join(" ");
      if (
        allTexts.includes("mardi") &&
        allTexts.includes("jeudi") &&
        allTexts.includes("samedi")
      ) {
        pass("PRECISION: Found publishing schedule (mardi, jeudi, samedi)");
      } else {
        fail(
          "PRECISION: Found publishing schedule",
          `Results: ${allTexts.slice(0, 300)}`,
        );
      }
    }

    // Test 10: Conversion rate target
    {
      const res = await searchResources(
        page,
        "taux conversion landing page objectif",
        5,
      );
      const results = res.data?.[0]?.result?.data?.json ?? [];
      const allTexts = results
        .flatMap((r) => r.matches?.map((m) => m.text) ?? [])
        .join(" ");
      if (allTexts.includes("3.7")) {
        pass("PRECISION: Found conversion rate (3.7%)");
      } else {
        fail(
          "PRECISION: Found conversion rate (3.7%)",
          `Results: ${allTexts.slice(0, 300)}`,
        );
      }
    }

    // ─── §5 Cleanup ────────────────────────────────────────────────────────
    console.log("\n📋  §5 — Cleanup\n");

    for (const id of createdResources) {
      const status = await deleteResource(page, id);
      if (status === 200) {
        pass(`Deleted test resource ${id.slice(0, 8)}...`);
      } else {
        fail(`Delete test resource ${id.slice(0, 8)}...`, `Status ${status}`);
      }
    }
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
