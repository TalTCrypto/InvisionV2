/**
 * YouTube Analysis — E2E
 *
 * Validates:
 *   1. Auth & input gates on POST /api/youtube/analyze and /api/audio/transcribe
 *   2. Three-tab UI (URL · Transcript · Audio) renders and switches correctly
 *   3. Submit-button enable/disable follows mode-specific input state
 *   4. Transcript-mode submit does NOT fire youtube.getTranscript tRPC
 *      (regression guard: the original URL-only flow always triggered it,
 *       producing a noisy console error for videos without captions)
 *
 * Requires: dev server running   (`npm run dev`)
 * Run:      npm run test:e2e
 */

import puppeteer from "puppeteer";
import { TIMEOUTS } from "./config.js";
import { loginOnly, navigateTo } from "./helpers.js";

// ─── helpers ─────────────────────────────────────────────────────────────────

/** POST JSON → cancel body immediately → return HTTP status.  Safe for SSE. */
async function postJsonStatus(page, path, body) {
  return page.evaluate(
    async (p, b) => {
      const r = await fetch(p, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(b),
      });
      r.body?.cancel();
      return r.status;
    },
    path,
    body,
  );
}

/** POST multipart (string fields only – no real File) → return HTTP status. */
async function postFormStatus(page, path, fields) {
  return page.evaluate(
    async (p, f) => {
      const fd = new FormData();
      for (const { name, value } of f) fd.append(name, value);
      const r = await fetch(p, { method: "POST", body: fd });
      r.body?.cancel();
      return r.status;
    },
    path,
    fields,
  );
}

/** Click the first <button> whose textContent includes `label`. */
async function clickButton(page, label) {
  return page.evaluate((lbl) => {
    for (const b of document.querySelectorAll("button")) {
      if (b.textContent?.includes(lbl)) {
        b.click();
        return true;
      }
    }
    return false;
  }, label);
}

/** Programmatically set a <textarea> value and fire React's input event. */
async function setTextarea(page, text) {
  return page.evaluate((t) => {
    const el = document.querySelector("textarea");
    if (!el) return false;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    if (setter) setter.call(el, t);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }, text);
}

/** Return the `disabled` state of the "Analyser" submit button (or null). */
async function isSubmitDisabled(page) {
  return page.evaluate(() => {
    for (const b of document.querySelectorAll("button")) {
      if (b.textContent?.includes("Analyser")) return b.disabled;
    }
    return null;
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── runner ─────────────────────────────────────────────────────────────────

(async () => {
  console.log("🎬  YouTube Analysis — E2E\n");

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
  //  1. API GATES – unauthenticated
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n🚫  API gates – unauthenticated\n");

  const unauthedPage = await browser.newPage();
  unauthedPage.setDefaultTimeout(TIMEOUTS.DEFAULT_MS);
  await navigateTo(unauthedPage, "/");

  {
    const s = await postJsonStatus(unauthedPage, "/api/youtube/analyze", {
      transcript: "hello",
    });
    s === 401
      ? pass("POST /api/youtube/analyze → 401")
      : fail("POST /api/youtube/analyze → 401", `got ${s}`);
  }
  {
    const s = await postFormStatus(unauthedPage, "/api/audio/transcribe", []);
    s === 401
      ? pass("POST /api/audio/transcribe → 401")
      : fail("POST /api/audio/transcribe → 401", `got ${s}`);
  }

  await unauthedPage.close();

  // ═══════════════════════════════════════════════════════════════════════════
  //  2. API GATES – authenticated  (input-validation)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n🔐  API gates – authenticated\n");

  const apiPage = await browser.newPage();
  apiPage.setDefaultTimeout(TIMEOUTS.DEFAULT_MS);
  await loginOnly(apiPage);
  await navigateTo(apiPage, "/");

  // youtube/analyze ── body validation
  {
    const s = await postJsonStatus(apiPage, "/api/youtube/analyze", {});
    s === 400
      ? pass("POST /api/youtube/analyze {}  → 400")
      : fail("POST /api/youtube/analyze {} → 400", `got ${s}`);
  }
  {
    const s = await postJsonStatus(apiPage, "/api/youtube/analyze", {
      transcript: "   ",
    });
    s === 400
      ? pass("POST /api/youtube/analyze whitespace-only → 400")
      : fail("POST /api/youtube/analyze whitespace → 400", `got ${s}`);
  }
  {
    const s = await postJsonStatus(apiPage, "/api/youtube/analyze", {
      transcript:
        "[0:00] Bonjour tout le monde.\n" +
        "[0:05] Bienvenue dans cette vidéo.\n" +
        "[0:10] On va parler de programmation.\n" +
        "[0:15] Restez jusqu'à la fin.",
    });
    s === 200
      ? pass("POST /api/youtube/analyze valid transcript → 200 (SSE stream)")
      : fail("POST /api/youtube/analyze valid → 200", `got ${s}`);
  }

  // audio/transcribe ── body validation
  {
    const s = await postFormStatus(apiPage, "/api/audio/transcribe", []);
    s === 400
      ? pass('POST /api/audio/transcribe (no "audio" field)  → 400')
      : fail("POST /api/audio/transcribe no field → 400", `got ${s}`);
  }
  {
    const s = await postFormStatus(apiPage, "/api/audio/transcribe", [
      { name: "audio", value: "not-a-real-file" },
    ]);
    s === 400
      ? pass('POST /api/audio/transcribe ("audio" is a string) → 400')
      : fail("POST /api/audio/transcribe string → 400", `got ${s}`);
  }

  await apiPage.close();

  // ═══════════════════════════════════════════════════════════════════════════
  //  3. UI – tab presence & switching
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n🖥️   UI – tabs & inputs\n");

  const uiPage = await browser.newPage();
  uiPage.setDefaultTimeout(TIMEOUTS.DEFAULT_MS);
  await loginOnly(uiPage);
  await navigateTo(uiPage, "/dashboard/integrations/youtube");

  // 3a – three tab buttons present
  {
    const tabs = await uiPage.evaluate(() =>
      Array.from(document.querySelectorAll("button")).map(
        (b) => b.textContent?.trim() ?? "",
      ),
    );
    const has = (t) => tabs.some((l) => l.includes(t));
    has("YouTube URL") && has("Transcript") && has("Fichier Audio")
      ? pass("3 mode tabs rendered (URL · Transcript · Audio)")
      : fail("3 mode tabs", `buttons: ${tabs.filter(Boolean).join(", ")}`);
  }

  // 3b – default URL tab: <input> present, <textarea> absent
  {
    const input = await uiPage.evaluate(
      () => !!document.querySelector('input[placeholder*="youtube.com"]'),
    );
    const textarea = await uiPage.evaluate(
      () => !!document.querySelector("textarea"),
    );
    input && !textarea
      ? pass("URL tab (default) – Input visible, Textarea absent")
      : fail("URL default", `input=${input} textarea=${textarea}`);
  }

  // 3c – switch → Transcript
  {
    await clickButton(uiPage, "Transcript");
    await uiPage.waitForSelector("textarea", { timeout: 5000 });
    const textarea = await uiPage.evaluate(
      () => !!document.querySelector("textarea"),
    );
    const input = await uiPage.evaluate(
      () => !!document.querySelector('input[placeholder*="youtube.com"]'),
    );
    textarea && !input
      ? pass("Transcript tab – Textarea visible, URL Input absent")
      : fail("Transcript switch", `textarea=${textarea} input=${input}`);
  }

  // 3d – switch → Audio
  {
    await clickButton(uiPage, "Fichier Audio");
    await uiPage.waitForSelector('input[type="file"]', { timeout: 5000 });
    const fileInput = await uiPage.evaluate(
      () => !!document.querySelector('input[type="file"]'),
    );
    const uploadLabel = await uiPage.evaluate(() =>
      document.body.innerText.includes("Glissez un fichier audio"),
    );
    fileInput && uploadLabel
      ? pass("Audio tab – file input + upload label visible")
      : fail("Audio switch", `fileInput=${fileInput} label=${uploadLabel}`);
  }

  await uiPage.close();

  // ═══════════════════════════════════════════════════════════════════════════
  //  4. UI – submit-button enable / disable per mode
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n🔘  Submit button state\n");

  const btnPage = await browser.newPage();
  btnPage.setDefaultTimeout(TIMEOUTS.DEFAULT_MS);
  await loginOnly(btnPage);
  await navigateTo(btnPage, "/dashboard/integrations/youtube");

  // 4a – URL mode, empty input → disabled
  {
    const d = await isSubmitDisabled(btnPage);
    d === true
      ? pass("URL tab, empty input → submit disabled")
      : fail("URL empty disabled", `disabled=${d}`);
  }

  // 4b – Transcript mode: disabled → type → enabled
  {
    await clickButton(btnPage, "Transcript");
    await btnPage.waitForSelector("textarea", { timeout: 5000 });

    const dBefore = await isSubmitDisabled(btnPage);
    await setTextarea(btnPage, "[0:00] Texte de test pour le bouton");
    await delay(300); // React re-render
    const dAfter = await isSubmitDisabled(btnPage);

    dBefore === true && dAfter === false
      ? pass("Transcript tab – disabled when empty, enabled after input")
      : fail("Transcript toggle", `before=${dBefore} after=${dAfter}`);
  }

  // 4c – Audio mode, no file → disabled
  {
    await clickButton(btnPage, "Fichier Audio");
    await btnPage.waitForSelector('input[type="file"]', { timeout: 5000 });
    const d = await isSubmitDisabled(btnPage);
    d === true
      ? pass("Audio tab, no file → submit disabled")
      : fail("Audio no-file disabled", `disabled=${d}`);
  }

  await btnPage.close();

  // ═══════════════════════════════════════════════════════════════════════════
  //  5. NETWORK – neither mode must call youtube.getTranscript tRPC
  //     5a  Transcript mode → POST /api/youtube/analyze, zero getTranscript
  //     5b  URL mode        → GET  /api/youtube/analyze, zero getTranscript
  //         (regression guard for the console-error bug on videos without captions)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n🔍  Network – both modes skip getTranscript\n");

  const netPage = await browser.newPage();
  netPage.setDefaultTimeout(TIMEOUTS.DEFAULT_MS);

  // Install interceptor BEFORE any navigation so nothing is missed
  const captured = { getTranscript: [], analyzePost: [], analyzeGet: [] };
  netPage.on("request", (req) => {
    const url = req.url();
    if (url.includes("youtube.getTranscript")) {
      captured.getTranscript.push(url);
    }
    if (url.includes("/api/youtube/analyze") && req.method() === "POST") {
      captured.analyzePost.push(url);
    }
    if (url.includes("/api/youtube/analyze") && req.method() === "GET") {
      captured.analyzeGet.push(url);
    }
  });

  await loginOnly(netPage);
  await navigateTo(netPage, "/dashboard/integrations/youtube");

  // ── 5a – Transcript mode ─────────────────────────────────────────────────
  await clickButton(netPage, "Transcript");
  await netPage.waitForSelector("textarea", { timeout: 5000 });
  await setTextarea(
    netPage,
    "[0:00] Bonjour tout le monde.\n[0:10] Bienvenue dans la vidéo de test.",
  );
  await delay(300);

  captured.getTranscript.length = 0; // discard anything from login / page load
  captured.analyzePost.length = 0;
  captured.analyzeGet.length = 0;

  await clickButton(netPage, "Analyser");
  await delay(4000); // let fetch fire and propagate

  captured.getTranscript.length === 0
    ? pass("Transcript submit → youtube.getTranscript NOT fired")
    : fail(
        "No getTranscript in transcript mode",
        `${captured.getTranscript.length} call(s)`,
      );

  captured.analyzePost.length > 0
    ? pass("Transcript submit → POST /api/youtube/analyze IS fired")
    : fail("POST /api/youtube/analyze fired", "0 calls detected");

  // ── 5b – URL mode (the original bug: console error on every submit) ─────
  // Re-navigate to reset React state — the page is still in "analyzing" after
  // 5a's submit so tab buttons are disabled.  The request interceptor installed
  // with netPage.on() persists across navigations.
  await navigateTo(netPage, "/dashboard/integrations/youtube");
  // Use a real video ID — the analyze endpoint will fail (no captions / yt-dlp
  // 403) but that is fine; we only care about WHICH requests were made.
  await netPage.waitForSelector('input[placeholder*="youtube.com"]', {
    timeout: 5000,
  });

  // Set URL input via React-compatible native-setter pattern
  await netPage.evaluate(() => {
    const el = document.querySelector('input[placeholder*="youtube.com"]');
    if (!el) return;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    if (setter) setter.call(el, "https://www.youtube.com/watch?v=eeiXhDytBE0");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await delay(300);

  // Clear captures before the submit
  captured.getTranscript.length = 0;
  captured.analyzePost.length = 0;
  captured.analyzeGet.length = 0;

  await clickButton(netPage, "Analyser");
  await delay(3000); // enough for the GET request to fire

  captured.getTranscript.length === 0
    ? pass("URL submit → youtube.getTranscript NOT fired")
    : fail(
        "No getTranscript in URL mode",
        `${captured.getTranscript.length} call(s)`,
      );

  captured.analyzeGet.length > 0
    ? pass("URL submit → GET /api/youtube/analyze IS fired")
    : fail("GET /api/youtube/analyze fired", "0 calls detected");

  await netPage.close();

  // ═══════════════════════════════════════════════════════════════════════════
  //  6. RESOURCES INTEGRATION
  //     6a  metadata event  → resourcesUsed > 0 + resourceTitles
  //     6b  analysis event  → parsedAnalysis.resourceJustifications present
  //         with linkedResources that cite the E2E fixture resource
  //     Full stream is consumed in one evaluate() so the LLM pipeline
  //     completes end-to-end inside the browser context.
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n📦  Resources integration\n");

  const resPage = await browser.newPage();
  resPage.setDefaultTimeout(180000); // full pipeline can take a while
  await loginOnly(resPage);
  await navigateTo(resPage, "/");

  {
    // POST transcript → consume FULL SSE stream → collect metadata + analysis
    const collected = await resPage.evaluate(async () => {
      const res = await fetch("/api/youtube/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript:
            "[0:00] Bienvenue dans cette vidéo sur le marketing digital.\n" +
            "[0:10] Aujourd'hui on va parler des stratégies de contenu pour entrepreneurs.\n" +
            "[0:20] Je vais vous montrer comment créer une présence en ligne solide.\n" +
            "[0:30] Ces techniques sont adaptées aux petits budgets.\n" +
            "[0:40] On commence par l'analyse des keywords YouTube.\n" +
            "[0:50] Puis on passe à la création de contenus tutoriels.",
          title: "Marketing Digital pour Entrepreneurs",
        }),
      });
      if (!res.ok) return { error: `HTTP ${res.status}` };

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let metadata = null;
      let analysisData = null;
      const deadline = Date.now() + 150000; // 2.5 min hard cap

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
            if (eventName === "metadata") metadata = parsed;
            if (eventName === "analysis") analysisData = parsed;
          } catch {}
        }
      }

      return { metadata, analysisData };
    });

    // 6a — metadata assertions
    if (collected.error) {
      fail("POST metadata has resourcesUsed > 0", collected.error);
      fail(
        "POST metadata resourceTitles includes E2E Test Resource",
        "skipped",
      );
      fail("analysis has resourceJustifications", "skipped");
      fail("resourceJustifications cite E2E Test Resource", "skipped");
    } else {
      const meta = collected.metadata;
      meta && meta.resourcesUsed > 0
        ? pass("POST metadata has resourcesUsed > 0")
        : fail(
            "POST metadata resourcesUsed > 0",
            `resourcesUsed=${meta?.resourcesUsed}`,
          );

      meta &&
      Array.isArray(meta.resourceTitles) &&
      meta.resourceTitles.includes("E2E Test Resource")
        ? pass("POST metadata resourceTitles includes E2E Test Resource")
        : fail(
            "POST metadata resourceTitles",
            `got ${JSON.stringify(meta?.resourceTitles)}`,
          );

      // 6b — resourceJustifications assertions
      const justifications =
        collected.analysisData?.parsedAnalysis?.resourceJustifications;
      Array.isArray(justifications) && justifications.length > 0
        ? pass("analysis has resourceJustifications (non-empty)")
        : fail(
            "analysis has resourceJustifications",
            `got ${JSON.stringify(justifications)}`,
          );

      const citesE2E =
        Array.isArray(justifications) &&
        justifications.some((j) =>
          (j.linkedResources || []).some(
            (r) => r.source === "E2E Test Resource",
          ),
        );
      citesE2E
        ? pass("resourceJustifications cite E2E Test Resource")
        : fail(
            "resourceJustifications cite E2E Test Resource",
            "no linkedResource with source === 'E2E Test Resource'",
          );
    }
  }

  await resPage.close();

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
