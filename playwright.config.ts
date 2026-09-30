import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;
// Overridable so parallel runs (e.g. other worktrees) don't collide on the fixture port or DB.
const FIXTURE_PORT = Number(process.env.FIXTURE_PORT ?? 3101);
const fixtureURL = `http://localhost:${FIXTURE_PORT}`;
const DB_NAME = process.env.E2E_DB_NAME ?? "dota_den_e2e";

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/support/global-setup.ts",
  fullyParallel: true,
  // Runs against `next dev`, which compiles routes on first hit.
  expect: { timeout: 15_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL, trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node tests/e2e/support/opendota-fixture-server.mjs",
      url: `${fixtureURL}/health`,
      reuseExistingServer: !process.env.CI,
      env: { FIXTURE_PORT: String(FIXTURE_PORT) },
    },
    {
      // `next dev`, not `next start`: the fake identity provider is refused when NODE_ENV=production.
      command: `npx next dev --port ${PORT}`,
      url: `${baseURL}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        APP_URL: baseURL,
        MONGODB_URI: process.env.MONGODB_TEST_URI ?? "mongodb://127.0.0.1:27017",
        MONGODB_DB_NAME: DB_NAME,
        AUTH_TEST_MODE: "true",
        // The default test identity (Fixture Hero) is an admin, to cover /admin.
        ADMIN_STEAM_IDS: "76561197960287930",
        // Keep the E2E build separate from a developer's `next dev`.
        NEXT_DIST_DIR: ".next-e2e",
        // Never call the real OpenDota API from tests.
        OPENDOTA_BASE_URL: `${fixtureURL}/api`,
        VALVE_DATAFEED_BASE_URL: `${fixtureURL}/datafeed`,
        // Never call a paid model from tests (overrides any key in .env.local).
        GROQ_API_KEY: "",
        // Never use shared Redis or the durable job queue from tests (ADR 0008).
        UPSTASH_REDIS_REST_URL: "",
        UPSTASH_REDIS_REST_TOKEN: "",
        QSTASH_TOKEN: "",
        QSTASH_CURRENT_SIGNING_KEY: "",
        QSTASH_NEXT_SIGNING_KEY: "",
      },
    },
  ],
});
