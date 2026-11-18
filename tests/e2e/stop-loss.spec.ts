import { expect, test } from "@playwright/test";

// Each test has its own identity (tests in a file run in parallel).
const LOGIN = "/api/v1/auth/steam/login?as=76561197960459301";
const ACCOUNT = 76561197960459301n - 76561197960265728n;
const API_LOGIN = "/api/v1/auth/steam/login?as=76561197960459302";
const FIXTURE = `http://127.0.0.1:${process.env.FIXTURE_PORT ?? 3101}`;

test("set a stop-loss, then see it reached on the overview after two losses", async ({
  page,
  baseURL,
}) => {
  const headers = { origin: new URL(baseURL!).origin };
  // Sign in without opening the dashboard (which would sync before the games exist).
  await page.request.get(LOGIN);
  for (let i = 0; i < 2; i++)
    await page.request.post(`${FIXTURE}/e2e/play?account=${ACCOUNT}&result=loss`);
  const sync = await page.request.post("/api/v1/me/matches/sync", { headers });
  expect(sync.status()).toBe(200);
  expect((await sync.json()).data.inserted).toBe(2);

  // No stop-loss yet: the latest session invites the player to set one.
  await page.goto("/dashboard");
  const latest = page.getByRole("region", { name: /Latest session/ });
  await expect(latest.getByText("Want a nudge to stop before you tilt?")).toBeVisible();
  await latest.getByRole("link", { name: "Set a stop-loss" }).click();
  await expect(page).toHaveURL(/\/account#stop-loss$/);

  const card = page.getByRole("region", { name: "Stop-loss" });
  const losses = card.getByRole("radiogroup", { name: "Losses in a session" });
  const games = card.getByRole("radiogroup", { name: "Games in a session" });
  // Turning it on before hydration doesn't reach React: retry until the default pick shows.
  await expect(async () => {
    await card.getByLabel("Turn on my stop-loss").setChecked(true);
    await expect(losses.getByRole("radio", { name: "2" })).toHaveAttribute("aria-checked", "true", {
      timeout: 2_000,
    });
  }).toPass({ timeout: 30_000 });

  // A custom value outside the range is refused before saving.
  await games.getByRole("radio", { name: "Custom" }).click();
  const custom = card.getByLabel(/Games in a session: custom limit/);
  await custom.fill("25");
  await card.getByRole("button", { name: "Save stop-loss" }).click();
  await expect(card.getByRole("alert")).toHaveText(
    "Games in a session: pick a number from 1 to 20.",
  );
  await custom.fill("6");
  await card.getByRole("button", { name: "Save stop-loss" }).click();
  await expect(page.getByText("Stop-loss saved.")).toBeVisible();

  await page.reload();
  await expect(losses.getByRole("radio", { name: "2" })).toHaveAttribute("aria-checked", "true");
  await expect(card.getByLabel(/Games in a session: custom limit/)).toHaveValue("6");

  // The overview: both losses count, and the limit is reached while the session is going.
  await page.goto("/dashboard");
  const status = page.getByRole("status", { name: "Stop-loss" });
  await expect(status).toContainText("2 of 2 losses used");
  await expect(status).toContainText("2 of 6 games played");
  await expect(status).toContainText("Limit reached. Good time to stop.");

  // Turning it off hides the status again (the numbers are kept).
  await page.goto("/account#stop-loss");
  await expect(async () => {
    await card.getByLabel("Turn on my stop-loss").setChecked(false);
    await card.getByRole("button", { name: "Save stop-loss" }).click();
    await expect(page.getByText("Stop-loss turned off.")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await page.goto("/dashboard");
  await expect(page.getByRole("link", { name: "Set a stop-loss" })).toBeVisible();
  await expect(page.getByRole("status", { name: "Stop-loss" })).toHaveCount(0);
});

test("stop-loss settings need a session, the same origin and valid limits", async ({
  request,
  baseURL,
}) => {
  const origin = new URL(baseURL!).origin;
  const put = (data: unknown, headers: Record<string, string> = { origin }) =>
    request.put("/api/v1/me/settings/stop-loss", { data, headers });
  const valid = { enabled: true, limits: { losses: 3, streak: null, games: null } };
  expect((await put(valid, {})).status()).toBe(403);
  expect((await put(valid)).status()).toBe(401);
  expect((await request.get("/api/v1/me/settings/stop-loss")).status()).toBe(401);

  await request.get(API_LOGIN);
  // Off until set.
  expect((await (await request.get("/api/v1/me/settings/stop-loss")).json()).data).toEqual({
    enabled: false,
    limits: { losses: null, streak: null, games: null },
  });
  for (const limits of [
    { losses: 0, streak: null, games: null },
    { losses: null, streak: 1, games: null },
    { losses: null, streak: null, games: 21 },
    { losses: null, streak: null, games: null },
  ]) {
    const bad = await put({ enabled: true, limits });
    expect(bad.status()).toBe(400);
    expect(await bad.json()).toMatchObject({ success: false, code: "bad_request" });
  }
  const ok = await put(valid);
  expect(ok.status()).toBe(200);
  expect(await ok.json()).toMatchObject({ success: true, message: "Stop-loss saved", data: valid });
  expect((await (await request.get("/api/v1/me/settings/stop-loss")).json()).data).toEqual(valid);
});
