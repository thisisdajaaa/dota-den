import { defineConfig, devices } from "@playwright/test";
import webpush from "web-push";
import { E2E_CRON_SECRET } from "./tests/e2e/support/cron";
import { E2E_PLUS_CHECKOUT, E2E_PLUS_WEBHOOK_SECRET } from "./tests/e2e/support/plus-webhook";
import { E2E_RESEND_WEBHOOK_SECRET } from "./tests/e2e/support/resend-webhook";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;
// Overridable so parallel runs (e.g. other worktrees) don't collide on the fixture port or DB.
const FIXTURE_PORT = Number(process.env.FIXTURE_PORT ?? 3101);
const fixtureURL = `http://localhost:${FIXTURE_PORT}`;
const DB_NAME = process.env.E2E_DB_NAME ?? "dota_den_e2e";
// A second app server with Plus left unconfigured (the default for a fresh deployment).
const PLAIN_PORT = Number(process.env.E2E_PLAIN_PORT ?? PORT + 2);
process.env.E2E_PLAIN_URL = `http://localhost:${PLAIN_PORT}`;
// Throwaway Web Push keys so the notifications section is on in tests (nothing is committed).
const vapid = webpush.generateVAPIDKeys();

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
        // Hero and rank art from the fixture: no internet, and tiny images to resize.
        IMAGE_SOURCE_BASE_URL: `${fixtureURL}/images`,
        TWITCH_CLIENT_ID: "fixture",
        TWITCH_CLIENT_SECRET: "fixture",
        TWITCH_API_BASE_URL: `${fixtureURL}/twitch/helix`,
        TWITCH_AUTH_URL: `${fixtureURL}/twitch/oauth2/token`,
        KICK_CLIENT_ID: "fixture",
        KICK_CLIENT_SECRET: "fixture",
        KICK_API_BASE_URL: `${fixtureURL}/kick/public/v1`,
        KICK_AUTH_URL: `${fixtureURL}/kick/oauth/token`,
        // Friends playing now: a dummy key against the fixture's fake Steam Web API.
        STEAM_WEB_API_KEY: "e2e-steam-key",
        STEAM_API_BASE_URL: `${fixtureURL}/steam`,
        // Per-position stats from the fixture's fake STRATZ (overrides any token in .env.local).
        STRATZ_API_TOKEN: "e2e-stratz-fixture",
        STRATZ_API_BASE_URL: `${fixtureURL}/stratz`,
        // Never call a paid model from tests (overrides any key in .env.local).
        GROQ_API_KEY: "",
        // The AI match coach talks to the fixture's stand-in for Groq (nothing else does).
        MATCH_COACH_API_KEY: "e2e-groq-fixture",
        GROQ_BASE_URL: `${fixtureURL}/groq`,
        // Never use shared Redis or the durable job queue from tests (ADR 0008).
        UPSTASH_REDIS_REST_URL: "",
        UPSTASH_REDIS_REST_TOKEN: "",
        QSTASH_TOKEN: "",
        QSTASH_CURRENT_SIGNING_KEY: "",
        QSTASH_NEXT_SIGNING_KEY: "",
        VAPID_PUBLIC_KEY: vapid.publicKey,
        VAPID_PRIVATE_KEY: vapid.privateKey,
        VAPID_SUBJECT: "mailto:e2e@example.com",
        // A fake Resend API (the fixture server records what would have been sent).
        RESEND_API_KEY: "re_e2e_fixture",
        EMAIL_FROM: "Dota Den <digest@e2e.example>",
        RESEND_API_BASE_URL: `${fixtureURL}/resend`,
        EMAIL_TOKEN_SECRET: "",
        // Bounce and complaint webhooks: tests sign fake Resend events with this test secret.
        RESEND_WEBHOOK_SECRET: E2E_RESEND_WEBHOOK_SECRET,
        // Cron routes and the backup report (tests send this as the bearer secret).
        CRON_SECRET: E2E_CRON_SECRET,
        // Never post owner alerts to a real Discord channel from tests.
        ADMIN_ALERT_WEBHOOK_URL: "",
        // Dota Den Plus (ADR 0013): a fake Lemon Squeezy store. Tests sign webhooks with this
        // test secret; checkout links only need to be well formed (nothing follows them).
        BILLING_PROVIDER: "lemonsqueezy",
        PLUS_ENABLED: "true",
        LEMONSQUEEZY_WEBHOOK_SECRET: E2E_PLUS_WEBHOOK_SECRET,
        LEMONSQUEEZY_CHECKOUT_URL_MONTHLY: E2E_PLUS_CHECKOUT.monthly,
        LEMONSQUEEZY_CHECKOUT_URL_YEARLY: E2E_PLUS_CHECKOUT.yearly,
        LEMONSQUEEZY_STORE_URL: "",
        LEMONSQUEEZY_VARIANT_ID_MONTHLY: "501",
        LEMONSQUEEZY_VARIANT_ID_YEARLY: "502",
        LEMONSQUEEZY_TEST_MODE: "false",
      },
    },
    {
      // Plus unconfigured: the pricing page says "coming soon" and the webhook doesn't exist.
      command: `npx next dev --port ${PLAIN_PORT}`,
      url: `http://localhost:${PLAIN_PORT}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        APP_URL: `http://localhost:${PLAIN_PORT}`,
        MONGODB_URI: process.env.MONGODB_TEST_URI ?? "mongodb://127.0.0.1:27017",
        MONGODB_DB_NAME: DB_NAME,
        AUTH_TEST_MODE: "true",
        NEXT_DIST_DIR: ".next-e2e-plain",
        OPENDOTA_BASE_URL: `${fixtureURL}/api`,
        VALVE_DATAFEED_BASE_URL: `${fixtureURL}/datafeed`,
        IMAGE_SOURCE_BASE_URL: `${fixtureURL}/images`,
        GROQ_API_KEY: "",
        MATCH_COACH_API_KEY: "",
        UPSTASH_REDIS_REST_URL: "",
        UPSTASH_REDIS_REST_TOKEN: "",
        QSTASH_TOKEN: "",
        QSTASH_CURRENT_SIGNING_KEY: "",
        QSTASH_NEXT_SIGNING_KEY: "",
        TWITCH_CLIENT_ID: "",
        TWITCH_CLIENT_SECRET: "",
        KICK_CLIENT_ID: "",
        KICK_CLIENT_SECRET: "",
        STEAM_WEB_API_KEY: "",
        // No STRATZ: the Meta page places heroes by OpenDota lane data, as before.
        STRATZ_API_TOKEN: "",
        STRATZ_API_BASE_URL: "",
        VAPID_PUBLIC_KEY: "",
        VAPID_PRIVATE_KEY: "",
        RESEND_API_KEY: "",
        EMAIL_FROM: "",
        RESEND_WEBHOOK_SECRET: "",
        ADMIN_ALERT_WEBHOOK_URL: "",
        BILLING_PROVIDER: "",
        PLUS_ENABLED: "",
        LEMONSQUEEZY_WEBHOOK_SECRET: "",
        LEMONSQUEEZY_CHECKOUT_URL_MONTHLY: "",
        LEMONSQUEEZY_CHECKOUT_URL_YEARLY: "",
      },
    },
  ],
});
