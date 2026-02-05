/**
 * Route-security cartography — E2E
 *
 * Covers every page AND every API endpoint in the app.
 * Two phases per route:
 *   🚫 unauthenticated  – fresh browser / no cookies
 *   🔐 authenticated    – E2E user (role = user, onboarding complete)
 *
 * ── Page expectations ──────────────────────────────────────────────────
 *   "page"       stays on the requested path  (page rendered)
 *   "→ /x/y"     lands on /x/y after redirect
 *
 * ── API expectations ───────────────────────────────────────────────────
 *   200          exact HTTP status
 *   "!401"       any status EXCEPT 401  (auth passed; param errors OK)
 *
 * Run:   npm run test:e2e
 */

import puppeteer from "puppeteer";
import { TIMEOUTS } from "./config.js";
import { loginOnly, navigateTo } from "./helpers.js";

// ═══════════════════════════════════════════════════════════════════════════
//  ROUTE TABLES
// ═══════════════════════════════════════════════════════════════════════════

// ── pages ────────────────────────────────────────────────────────────────
const PAGES = [
  // public
  { path: "/", unauthed: "page", authed: "page" },
  { path: "/auth/signin", unauthed: "page", authed: "page" },

  // dashboard  (layout guard: session + onboarding)
  { path: "/dashboard", unauthed: "→ /auth/signin", authed: "page" },
  { path: "/dashboard/chat", unauthed: "→ /auth/signin", authed: "page" },
  {
    path: "/dashboard/organization",
    unauthed: "→ /auth/signin",
    authed: "page",
  },
  {
    path: "/dashboard/integrations",
    unauthed: "→ /auth/signin",
    authed: "page",
  },
  {
    path: "/dashboard/integrations/youtube",
    unauthed: "→ /auth/signin",
    authed: "page",
  },
  {
    path: "/dashboard/integrations/instagram",
    unauthed: "→ /auth/signin",
    authed: "page",
  },
  // [slug] dynamic — valid slug that has no dedicated page → stays on [slug]
  {
    path: "/dashboard/integrations/twitter",
    unauthed: "→ /auth/signin",
    authed: "page",
  },
  {
    path: "/dashboard/ressources",
    unauthed: "→ /auth/signin",
    authed: "page",
  },

  // admin  (layout guard: session + role = admin)
  // E2E user is role=user  →  non-admin redirect fires after auth
  {
    path: "/dashboard/admin/workflows",
    unauthed: "→ /auth/signin",
    authed: "→ /dashboard",
  },

  // onboarding
  // /onboarding itself has no server layout guard — client redirects when
  // onboarding is already completed.
  { path: "/onboarding", unauthed: "page", authed: "→ /dashboard" },
  // /onboarding/integrations  layout: session + onboarding-completed
  {
    path: "/onboarding/integrations",
    unauthed: "→ /auth/signin",
    authed: "page",
  },
  // /onboarding/integrations/callback  same layout applies
  {
    path: "/onboarding/integrations/callback",
    unauthed: "→ /auth/signin",
    authed: "page",
  },
];

// ── APIs ─────────────────────────────────────────────────────────────────
const APIS = [
  // public — no auth required
  { method: "GET", path: "/api/health", unauthed: 200, authed: 200 },
  { method: "GET", path: "/api/auth/get-session", unauthed: 200, authed: 200 },

  // tRPC — representative protected procedure
  {
    method: "GET",
    path: "/api/trpc/onboarding.getStatus",
    unauthed: 401,
    authed: 200,
  },

  // SSE streams — all require session (401 if missing);
  // with a valid session but without the required query-params the handlers
  // return 400, which is fine — we only assert "auth gate passed".
  {
    method: "GET",
    path: "/api/chat/v2/stream",
    unauthed: 401,
    authed: "!401",
  },
  {
    method: "GET",
    path: "/api/instagram/analyze",
    unauthed: 401,
    authed: "!401",
  },
  {
    method: "GET",
    path: "/api/youtube/analyze",
    unauthed: 401,
    authed: "!401",
  },

  // POST endpoints – empty body → 400 (validation); we only assert auth gate
  {
    method: "POST",
    path: "/api/youtube/analyze",
    unauthed: 401,
    authed: "!401",
  },
  {
    method: "POST",
    path: "/api/audio/transcribe",
    unauthed: 401,
    authed: "!401",
  },
];

// ═══════════════════════════════════════════════════════════════════════════
//  ASSERTION HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/** Check a page expectation against the actual final pathname */
function checkPage(requestedPath, expectation, actualPath) {
  if (expectation === "page") return actualPath === requestedPath;
  if (expectation.startsWith("→ ")) return actualPath === expectation.slice(2);
  return false;
}

/**
 * Check an API expectation against the actual HTTP status.
 *   number  → exact match
 *   "!N"    → anything except N
 */
function checkApi(expectation, actualStatus) {
  if (typeof expectation === "number") return actualStatus === expectation;
  if (typeof expectation === "string" && expectation.startsWith("!")) {
    return actualStatus !== Number(expectation.slice(1));
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════
//  FETCH HELPER (runs inside the Puppeteer page context)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fire a fetch from inside the page (cookies auto-sent) and return status.
 */
async function apiStatus(page, method, path) {
  return page.evaluate(
    async (m, p) => {
      const r = await fetch(p, { method: m });
      return r.status;
    },
    method,
    path,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  FORMATTING
// ═══════════════════════════════════════════════════════════════════════════

function fmtPage(path, expectation, actual, ok) {
  const icon = ok ? "✅" : "❌";
  return (
    `  ${icon}  ${path.padEnd(46)}` +
    `expect: ${String(expectation).padEnd(20)}` +
    `got: ${actual}`
  );
}

function fmtApi(method, path, expectation, actual, ok) {
  const icon = ok ? "✅" : "❌";
  const label = `${method} ${path}`;
  return (
    `  ${icon}  ${label.padEnd(46)}` +
    `expect: ${String(expectation).padEnd(8)}` +
    `got: ${actual}`
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  RUNNER
// ═══════════════════════════════════════════════════════════════════════════

(async () => {
  console.log("🗺️   Route-security cartography\n");

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const all = []; // accumulates { ok, label, phase, ... }

  // ── helper: run one full phase on a given page ─────────────────────────
  async function runPhase(page, phase, pageExpectKey, apiExpectKey) {
    // ── pages ──
    console.log(`  📄 Pages\n`);
    for (const route of PAGES) {
      const actual = await navigateTo(page, route.path);
      const expected = route[pageExpectKey];
      const ok = checkPage(route.path, expected, actual);
      all.push({
        ok,
        phase,
        section: "page",
        path: route.path,
        expected,
        actual,
      });
      console.log(fmtPage(route.path, expected, actual, ok));
    }

    // ── APIs ──
    // Make sure we are on an origin page so relative fetches resolve correctly
    await navigateTo(page, "/");

    console.log(`\n  🔧 APIs\n`);
    for (const route of APIS) {
      const actual = await apiStatus(page, route.method, route.path);
      const expected = route[apiExpectKey];
      const ok = checkApi(expected, actual);
      all.push({
        ok,
        phase,
        section: "api",
        path: route.path,
        method: route.method,
        expected,
        actual,
      });
      console.log(fmtApi(route.method, route.path, expected, actual, ok));
    }
  }

  // ── phase 1 – unauthenticated ───────────────────────────────────────────
  console.log("🚫  Unauthenticated\n");
  const unauthedPage = await browser.newPage();
  unauthedPage.setDefaultTimeout(TIMEOUTS.DEFAULT_MS);
  await runPhase(unauthedPage, "unauthed", "unauthed", "unauthed");
  await unauthedPage.close();

  // ── phase 2 – authenticated ─────────────────────────────────────────────
  console.log("\n\n🔐  Authenticated  (e2e@invision.test · role = user)\n");
  const authedPage = await browser.newPage();
  authedPage.setDefaultTimeout(TIMEOUTS.DEFAULT_MS);
  await loginOnly(authedPage);
  await runPhase(authedPage, "authed", "authed", "authed");
  await authedPage.close();

  // ── summary ─────────────────────────────────────────────────────────────
  const passed = all.filter((r) => r.ok).length;
  const failed = all.filter((r) => !r.ok);

  console.log("\n\n══════════════════════════════════════════════════════════");
  console.log(`  ${passed} / ${all.length} passed`);

  if (failed.length > 0) {
    console.log("\n  ── failures ──────────────────────────────────────────");
    for (const f of failed) {
      const tag = f.section === "api" ? `${f.method} ` : "";
      console.log(`  ❌  [${f.phase.padEnd(9)}] ${tag}${f.path}`);
      console.log(`            expected: ${f.expected}`);
      console.log(`            actual:   ${f.actual}`);
    }
  }
  console.log("══════════════════════════════════════════════════════════\n");

  await browser.close();
  process.exit(failed.length === 0 ? 0 : 1);
})();
