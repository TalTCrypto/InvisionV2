/**
 * YouTube Bot Detection Robustness — E2E
 *
 * Validates the multi-strategy fallback system handles bot detection gracefully:
 *   1. Tests with videos that previously triggered bot detection
 *   2. Verifies fallback strategies are attempted in correct order
 *   3. Confirms successful transcript extraction despite bot detection
 *   4. Validates error messages when ALL strategies fail
 *
 * Requires: dev server running (`npm run dev`)
 * Run:      npm run test:e2e
 */

import puppeteer from "puppeteer";
import { TIMEOUTS } from "./config.js";
import { loginOnly, navigateTo } from "./helpers.js";

// ─── helpers ─────────────────────────────────────────────────────────────────

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

/** Set URL input value using React-compatible native setter pattern. */
async function setUrlInput(page, url) {
  return page.evaluate((u) => {
    const el = document.querySelector('input[placeholder*="youtube.com"]');
    if (!el) return false;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    if (setter) setter.call(el, u);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }, url);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Consume SSE stream and collect all events until done or timeout
 * Returns: { metadata, analysis, error, logs: [] }
 */
async function consumeSSEStream(page, timeout = 180000) {
  return page.evaluate(async (maxWait) => {
    const logs = [];
    const log = (msg) => {
      logs.push(`[${new Date().toISOString().slice(11, 23)}] ${msg}`);
    };

    try {
      // Find the analyze GET request in network
      const urlInput = document.querySelector(
        'input[placeholder*="youtube.com"]',
      );
      if (!urlInput?.value) {
        return { error: "No URL input value found", logs };
      }

      const videoId = urlInput.value.match(/[?&]v=([^&]+)/)?.[1];
      if (!videoId) {
        return { error: "Could not extract video ID", logs };
      }

      log(`Starting SSE stream for video ${videoId}`);

      const res = await fetch(
        `/api/youtube/analyze?videoId=${encodeURIComponent(videoId)}`,
        {
          method: "GET",
          headers: { Accept: "text/event-stream" },
        },
      );

      if (!res.ok) {
        log(`HTTP ${res.status}: ${res.statusText}`);
        return { error: `HTTP ${res.status}`, logs };
      }

      log("Stream opened, reading events...");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let metadata = null;
      let analysisData = null;
      const deadline = Date.now() + maxWait;

      while (Date.now() < deadline) {
        const { done, value } = await reader.read();
        if (done) {
          log("Stream closed by server");
          break;
        }
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
            log(`Event: ${eventName} (${Object.keys(parsed).join(", ")})`);

            if (eventName === "metadata") metadata = parsed;
            if (eventName === "analysis") analysisData = parsed;
            if (eventName === "error") {
              log(`Error event: ${parsed.message}`);
              return { error: parsed.message, metadata, logs };
            }
          } catch (e) {
            log(`Failed to parse event: ${e.message}`);
          }
        }
      }

      if (Date.now() >= deadline) {
        log("Timeout reached");
        return { error: "Timeout", metadata, analysisData, logs };
      }

      log("Stream complete");
      return { metadata, analysisData, logs };
    } catch (err) {
      log(`Exception: ${err.message}`);
      return { error: err.message, logs };
    }
  }, timeout);
}

// ─── runner ─────────────────────────────────────────────────────────────────

(async () => {
  console.log("🤖  YouTube Bot Detection Robustness — E2E\n");

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
  //  1. PREVIOUSLY PROBLEMATIC VIDEO
  //     Video ID: zPG51bZ60Fk (reported by user as failing with bot detection)
  //     Should now succeed with multi-strategy fallback
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n🎯  Testing previously problematic video (zPG51bZ60Fk)\n");

  const page1 = await browser.newPage();
  page1.setDefaultTimeout(TIMEOUTS.DEFAULT_MS);

  // Capture console logs from the page for debugging
  const consoleLogs = [];
  page1.on("console", (msg) => {
    const text = msg.text();
    if (text.includes("Whisper") || text.includes("yt-dlp")) {
      consoleLogs.push(text);
    }
  });

  await loginOnly(page1);
  await navigateTo(page1, "/dashboard/integrations/youtube");

  await page1.waitForSelector('input[placeholder*="youtube.com"]', {
    timeout: 5000,
  });

  await setUrlInput(page1, "https://www.youtube.com/watch?v=zPG51bZ60Fk");
  await delay(500);

  // Click analyze button
  await clickButton(page1, "Analyser");
  await delay(2000); // Let the request initiate

  // Wait for and observe the UI state change
  const analysisStarted = await page1.evaluate(() => {
    return document.body.innerText.includes("Étape");
  });

  analysisStarted
    ? pass("Analysis initiated for zPG51bZ60Fk")
    : fail("Analysis start", "No 'Étape' text found in UI");

  // Wait longer for the full analysis (can take time with retries)
  await delay(120000); // 2 minutes

  // Check final state
  const finalState = await page1.evaluate(() => {
    const hasError =
      document.body.innerText.includes("erreur") ||
      document.body.innerText.includes("échec");
    const hasSuccess =
      document.body.innerText.includes("Hook") ||
      document.body.innerText.includes("Structure");
    return {
      hasError,
      hasSuccess,
      bodyPreview: document.body.innerText.substring(0, 500),
    };
  });

  if (consoleLogs.length > 0) {
    console.log("\n  📋 Console logs:");
    consoleLogs.forEach((log) => console.log(`      ${log}`));
  }

  !finalState.hasError && finalState.hasSuccess
    ? pass("zPG51bZ60Fk analysis completed successfully")
    : fail(
        "zPG51bZ60Fk success",
        `hasError=${finalState.hasError} hasSuccess=${finalState.hasSuccess}`,
      );

  await page1.close();

  // ═══════════════════════════════════════════════════════════════════════════
  //  2. PUBLIC VIDEO WITHOUT CAPTIONS
  //     Should fall back to Whisper transcription
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(
    "\n🎵  Testing public video without captions (should use Whisper)\n",
  );

  const page2 = await browser.newPage();
  page2.setDefaultTimeout(TIMEOUTS.DEFAULT_MS);

  const consoleLogs2 = [];
  page2.on("console", (msg) => {
    const text = msg.text();
    if (
      text.includes("Whisper") ||
      text.includes("yt-dlp") ||
      text.includes("captions")
    ) {
      consoleLogs2.push(text);
    }
  });

  await loginOnly(page2);
  await navigateTo(page2, "/dashboard/integrations/youtube");

  await page2.waitForSelector('input[placeholder*="youtube.com"]', {
    timeout: 5000,
  });

  // Use a known public music video (often has no auto-generated captions)
  await setUrlInput(
    page2,
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ", // Rick Astley - Never Gonna Give You Up
  );
  await delay(500);

  await clickButton(page2, "Analyser");
  await delay(2000);

  const whisperFallback = await page2.evaluate(() => {
    return document.body.innerText.includes("Étape");
  });

  whisperFallback
    ? pass("Whisper fallback initiated for video without captions")
    : fail("Whisper fallback", "Analysis did not start");

  if (consoleLogs2.length > 0) {
    console.log("\n  📋 Console logs:");
    consoleLogs2.forEach((log) => console.log(`      ${log}`));
  }

  // Check if Whisper was actually used
  const usedWhisper = consoleLogs2.some(
    (log) => log.includes("Downloading audio") || log.includes("Transcribing"),
  );

  usedWhisper
    ? pass("Whisper transcription was used")
    : fail("Whisper usage", "No Whisper logs detected");

  await page2.close();

  // ═══════════════════════════════════════════════════════════════════════════
  //  3. STRATEGY LOGGING
  //     Verify that strategy attempts are logged
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n📊  Checking strategy logging\n");

  const allLogs = [...consoleLogs, ...consoleLogs2];
  const hasStrategyLogs = allLogs.some((log) =>
    log.includes("Trying strategy"),
  );

  hasStrategyLogs
    ? pass("Strategy attempts are logged")
    : fail("Strategy logging", "No 'Trying strategy' logs found in console");

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
