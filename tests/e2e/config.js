/**
 * Shared constants for the E2E suite.
 * Credentials point at a dedicated test account created by setup.ts —
 * never use a real / production account here.
 */

export const BASE_URL = "http://localhost:3000";

export const TEST_USER = {
  email: "e2e@invision.test",
  password: "Passw0rd123!",
};

export const TIMEOUTS = {
  /** Max ms allowed for the user bubble to appear after pressing Send */
  USER_BUBBLE_MS: 2000,
  /** Max ms to wait for the AI to finish responding (tool-calls included) */
  AI_RESPONSE_MS: 120_000,
  /** Generic selector / navigation timeout */
  DEFAULT_MS: 30_000,
};
