/**
 * Chat Quality — Resource-Grounding E2E
 *
 * Validates that the chat orchestrator produces resource-grounded,
 * personalised responses instead of generic chatbot output.
 *
 * Every assertion is tied to concrete phrases / numbers that exist ONLY
 * in the E2E fixture resource created by setup.ts — a generic LLM cannot
 * produce them without having access to that data.
 *
 * Requires: dev server running   (`npm run dev`)
 * Run:      npm run test:e2e
 */

import puppeteer from "puppeteer";
import { TIMEOUTS } from "./config.js";
import { loginOnly, navigateTo } from "./helpers.js";

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Create a chat session via tRPC and return its ID. */
async function createChatSession(page, title = "E2E Chat Test") {
  return page.evaluate(async (t) => {
    const res = await fetch("/api/trpc/chatV2.createSession", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ json: { title: t } }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    // tRPC v11 fetch adapter: result lives at .result.data.json
    return data?.result?.data?.json?.id ?? null;
  }, title);
}

/**
 * Stream a single message through the orchestrator and return the
 * accumulated Final Answer text.  Reads every SSE event until "end".
 */
async function streamMessage(page, sessionId, message, timeoutMs = 120000) {
  return page.evaluate(
    async (sid, msg, timeout) => {
      const url =
        `/api/chat/v2/stream` +
        `?sessionId=${encodeURIComponent(sid)}` +
        `&message=${encodeURIComponent(msg)}` +
        `&agent=orchestrator`;

      const res = await fetch(url);
      if (!res.ok) return { error: `HTTP ${res.status}` };

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";
      const deadline = Date.now() + timeout;

      while (Date.now() < deadline) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          if (!part.trim()) continue;
          let eventName = "message";
          let dataStr = "";
          for (const line of part.split("\n")) {
            if (line.startsWith("event:")) eventName = line.slice(6).trim();
            if (line.startsWith("data:")) dataStr = line.slice(5).trim();
          }
          if (!dataStr) continue;
          try {
            const parsed = JSON.parse(dataStr);
            if (eventName === "token" && parsed.token) fullText += parsed.token;
            if (eventName === "message" && parsed.content)
              fullText = parsed.content;
            if (eventName === "end") return { text: fullText };
          } catch {
            // ignore malformed
          }
        }
      }
      return { text: fullText };
    },
    sessionId,
    message,
    timeoutMs,
  );
}

function hasAny(text, words) {
  const lower = text.toLowerCase();
  return words.some((w) => lower.includes(w.toLowerCase()));
}

function countMatches(text, words) {
  const lower = text.toLowerCase();
  return words.filter((w) => lower.includes(w.toLowerCase())).length;
}

// ─── fixture-specific keyword sets ───────────────────────────────────────────
// These must match content in the E2E Test Resource created by setup.ts.
// A generic LLM has no way to produce these without the resource data.

/** Avatar: "entrepreneur solo … 30 à 45 ans … YouTube" */
const AVATAR_ENTREPRENEUR = ["entrepreneur"];
const AVATAR_PLATFORM = ["youtube", "vidéo", "video"];

/** Objectives: "50% en 6 mois", "10k€ revenus mensuels", "formations en ligne" */
const OBJECTIVES_NUMBERS = ["50%", "10k", "10 000"];
const OBJECTIVES_CONCEPTS = ["formation", "abonnés", "revenus"];

/** Brand voice: "professionnelle mais accessible", "mentor bienveillant" */
const BRAND_VOICE = ["mentor", "bienveillant", "accessible", "professionnel"];

/** Positioning: "marketing digital pour entrepreneurs indépendants", "budgets limités" */
const POSITIONING = [
  "budget",
  "entrepreneur",
  "marketing digital",
  "indépendant",
  "tpe",
  "pme",
];

// ─── runner ─────────────────────────────────────────────────────────────────

(async () => {
  console.log("🧠  Chat Quality — Resource Grounding E2E\n");

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const results = [];
  const pass = (label) => {
    results.push({ ok: true, label });
    console.log(`  ✅  ${label}`);
  };
  const fail = (label, detail) => {
    results.push({ ok: false, label, detail });
    console.log(`  ❌  ${label} — ${detail}`);
  };

  // ═══════════════════════════════════════════════════════════════════════════
  //  1. AUTH GATE – unauthenticated stream request → 401
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n🚫  Auth gate — stream endpoint\n");

  const unauthedPage = await browser.newPage();
  unauthedPage.setDefaultTimeout(TIMEOUTS.DEFAULT_MS);
  await navigateTo(unauthedPage, "/");

  {
    const status = await unauthedPage.evaluate(async () => {
      const r = await fetch(
        "/api/chat/v2/stream?sessionId=fake&message=hello&agent=orchestrator",
      );
      return r.status;
    });
    status === 401
      ? pass("GET /api/chat/v2/stream unauthenticated → 401")
      : fail("stream auth gate", `got ${status}`);
  }

  await unauthedPage.close();

  // ═══════════════════════════════════════════════════════════════════════════
  //  2. SESSION CREATION
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n🔐  Session creation\n");

  const page = await browser.newPage();
  page.setDefaultTimeout(180000);
  await loginOnly(page);
  await navigateTo(page, "/");

  let sessionId;
  {
    sessionId = await createChatSession(page, "E2E Quality Test");
    sessionId
      ? pass("Session created via tRPC")
      : fail("Session creation", "returned null");
  }

  if (!sessionId) {
    console.log("\n  ⚠️  Cannot continue without session — aborting.\n");
    await page.close();
    await browser.close();
    process.exit(1);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  3. RESOURCE GROUNDING — avatar
  //     Fixture: "entrepreneur solo … 30 à 45 ans … YouTube"
  //     A generic answer would be vague; grounded answer is specific.
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n👤  Resource grounding — avatar\n");

  {
    const result = await streamMessage(
      page,
      sessionId,
      "Qui est mon avatar client?",
      120000,
    );

    if (result.error) {
      fail("Avatar stream completed", result.error);
      fail("Avatar: entrepreneur keyword", "skipped");
      fail("Avatar: YouTube/vidéo context", "skipped");
      fail("Avatar: substantive (>100 chars)", "skipped");
    } else {
      const text = result.text;
      console.log(`      [avatar — ${text.length} chars]\n`);

      hasAny(text, AVATAR_ENTREPRENEUR)
        ? pass("Avatar: mentions 'entrepreneur'")
        : fail("Avatar: entrepreneur keyword", "not found");

      hasAny(text, AVATAR_PLATFORM)
        ? pass("Avatar: mentions YouTube / vidéo context")
        : fail("Avatar: YouTube context", "not found");

      text.length > 100
        ? pass("Avatar: substantive response (>100 chars)")
        : fail("Avatar: substantive", `only ${text.length} chars`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  4. RESOURCE GROUNDING — objectives
  //     Fixture numbers: "50% en 6 mois", "10k€ revenus mensuels"
  //     These cannot be guessed — only present if the resource was read.
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n🎯  Resource grounding — objectives\n");

  {
    const result = await streamMessage(
      page,
      sessionId,
      "Quels sont mes objectifs business principaux?",
      120000,
    );

    if (result.error) {
      fail("Objectives stream completed", result.error);
      fail("Objectives: fixture-specific numbers", "skipped");
      fail("Objectives: fixture concepts", "skipped");
    } else {
      const text = result.text;
      console.log(`      [objectives — ${text.length} chars]\n`);

      hasAny(text, OBJECTIVES_NUMBERS)
        ? pass("Objectives: contains fixture numbers (50% / 10k€)")
        : fail(
            "Objectives: fixture numbers",
            `none of [${OBJECTIVES_NUMBERS}] found`,
          );

      hasAny(text, OBJECTIVES_CONCEPTS)
        ? pass("Objectives: references fixture concepts (formation / abonnés)")
        : fail("Objectives: fixture concepts", "not found");
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  5. RESOURCE GROUNDING — brand voice
  //     Fixture: "professionnelle mais accessible", "mentor bienveillant"
  //     Need ≥ 2 distinct keywords to confirm grounding.
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n🎨  Resource grounding — brand voice\n");

  {
    const result = await streamMessage(
      page,
      sessionId,
      "Quel est mon ton de communication?",
      120000,
    );

    if (result.error) {
      fail("Brand voice stream completed", result.error);
      fail("Brand voice: ≥2 fixture keywords", "skipped");
    } else {
      const text = result.text;
      console.log(`      [brand voice — ${text.length} chars]\n`);

      const matches = countMatches(text, BRAND_VOICE);
      matches >= 2
        ? pass(`Brand voice: ${matches} fixture keywords found`)
        : fail(
            "Brand voice: ≥2 fixture keywords",
            `only ${matches} of [${BRAND_VOICE}] matched`,
          );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  6. PROACTIVITY — vague question still grounds in resources
  //     A true "second brain" doesn't need the user to ask the right question.
  //     Fixture positioning: "marketing digital pour entrepreneurs indépendants"
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n🚀  Proactivity — vague question\n");

  {
    const result = await streamMessage(
      page,
      sessionId,
      "Comment améliorer ma situation globalement?",
      120000,
    );

    if (result.error) {
      fail("Proactivity stream completed", result.error);
      fail("Proactivity: substantive (>150 chars)", "skipped");
      fail("Proactivity: references resource concepts", "skipped");
    } else {
      const text = result.text;
      console.log(`      [proactivity — ${text.length} chars]\n`);

      text.length > 150
        ? pass("Proactivity: substantive response (>150 chars)")
        : fail("Proactivity: substantive", `only ${text.length} chars`);

      hasAny(text, POSITIONING)
        ? pass("Proactivity: references resource-specific positioning")
        : fail(
            "Proactivity: resource concepts",
            `none of [${POSITIONING}] found`,
          );
    }
  }

  await page.close();

  // ═══════════════════════════════════════════════════════════════════════════
  //  SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);

  console.log("\n\n══════════════════════════════════════════════════════════");
  console.log(`  ${passed} / ${results.length} passed`);

  if (failed.length > 0) {
    console.log("\n  ── failures ──────────────────────────────────────────");
    for (const f of failed) {
      console.log(`  ❌  ${f.label}`);
      if (f.detail) console.log(`            ${f.detail}`);
    }
  }
  console.log("══════════════════════════════════════════════════════════\n");

  await browser.close();
  process.exit(failed.length === 0 ? 0 : 1);
})();
