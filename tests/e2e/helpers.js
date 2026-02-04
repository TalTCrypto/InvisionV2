/**
 * Reusable Puppeteer helpers shared across every E2E test.
 */

import { BASE_URL, TEST_USER, TIMEOUTS } from "./config.js";

// ─── auth ───────────────────────────────────────────────────────────────────

/**
 * Sign in with the E2E test user.  Stops as soon as the browser leaves
 * /auth/signin — does NOT force-navigate anywhere afterwards, so the
 * caller can observe natural post-login redirects.
 */
export async function loginOnly(page) {
  await page.goto(`${BASE_URL}/auth/signin`, { waitUntil: "networkidle2" });
  await page.waitForSelector("#email");

  await page.click("#email");
  await page.type("#email", TEST_USER.email);
  await page.click("#password");
  await page.type("#password", TEST_USER.password);
  await page.click('button[type="submit"]');

  // Wait for the browser to leave the signin page
  await page
    .waitForNavigation({ waitUntil: "networkidle2", timeout: 15_000 })
    .catch(() => {});
  await delay(1500);
}

// ─── navigation ─────────────────────────────────────────────────────────────

/**
 * Go to `path`, wait for all redirects to settle, and return the final
 * pathname.  Useful for asserting auth / permission redirects.
 */
export async function navigateTo(page, path) {
  await page.goto(`${BASE_URL}${path}`, {
    waitUntil: "networkidle2",
    timeout: TIMEOUTS.DEFAULT_MS,
  });
  // Extra wait for client-side redirects that depend on a server round-trip
  // (e.g. onboarding page fetches getStatus then router.push).
  await delay(1500);
  return new URL(page.url()).pathname;
}

// ─── util ───────────────────────────────────────────────────────────────────

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
