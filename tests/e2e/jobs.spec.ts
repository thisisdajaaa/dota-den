import { expect, test } from "@playwright/test";

test("job endpoints don't exist without QStash, and sync still works inline", async ({
  request,
  page,
}) => {
  // Tests never configure QStash (ADR 0008): the endpoint answers 404, signed or not.
  const res = await request.post("/api/jobs/match-backfill", {
    data: { payload: { accountId32: 22202 }, dedupKey: null },
    headers: { "upstash-signature": "forged" },
  });
  expect(res.status()).toBe(404);
  expect((await request.post("/api/jobs/not-a-job", { data: {} })).status()).toBe(404);

  // Without the queue, signing in and syncing behaves as before.
  await page.goto("/api/v1/auth/steam/login");
  await page.goto("/dashboard");
  await expect(page.getByRole("region", { name: "Recent matches" })).toBeVisible({
    timeout: 20_000,
  });
});
