import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL, trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // `next dev`, not `next start`: the fake identity provider is refused when NODE_ENV=production.
    command: `npx next dev --port ${PORT}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      APP_URL: baseURL,
      MONGODB_URI: process.env.MONGODB_TEST_URI ?? "mongodb://127.0.0.1:27017",
      MONGODB_DB_NAME: "dota_den_e2e",
      AUTH_TEST_MODE: "true",
      // Keep the E2E build separate from a developer's `next dev`.
      NEXT_DIST_DIR: ".next-e2e",
    },
  },
});
