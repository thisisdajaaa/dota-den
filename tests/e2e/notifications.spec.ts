import { expect, test } from "@playwright/test";

// Its own test identity, so devices and settings saved here stay out of other specs.
const LOGIN = "/api/v1/auth/steam/login?as=76561197960457777";
const API_LOGIN = "/api/v1/auth/steam/login?as=76561197960457778";
// A push endpoint nothing listens on: sending to it fails without reaching the internet.
const ENDPOINT = "https://127.0.0.1:9/push/e2e-device";
const SUBSCRIPTION = { endpoint: ENDPOINT, keys: { p256dh: "BNcR", auth: "tBHI" } };

test("turn notifications on, pick what to get, then turn them off", async ({ page, baseURL }) => {
  // Writes must come from the app's own origin (the browser adds this header itself).
  const headers = { origin: new URL(baseURL!).origin };
  await page.goto(LOGIN);
  await page.goto("/account");
  const card = page.getByRole("region", { name: "Notifications" });
  // Headless Chromium reports the permission as "default" or "denied" depending on load, so
  // the card offers to turn on or explains it's blocked; either way it's there and labelled.
  await expect(
    card
      .getByRole("button", { name: "Turn on for this device" })
      .or(card.getByRole("status").filter({ hasText: "blocked" })),
  ).toBeVisible();
  // No device yet: nothing to choose.
  await expect(card.getByRole("group")).toHaveCount(0);

  // What the browser sends after the permission prompt (push services can't run in tests).
  const saved = await page.request.put("/api/v1/me/notifications/subscription", {
    data: SUBSCRIPTION,
    headers,
  });
  expect(saved.status()).toBe(200);
  expect((await saved.json()).data.endpoints).toEqual([ENDPOINT]);

  await page.goto("/account");
  // The device saved above counts as another device (this browser isn't subscribed).
  await expect(card.getByRole("group", { name: "What to send (all your devices)" })).toBeVisible();
  const weekly = card.getByRole("checkbox", { name: /Weekly recap/ });
  await expect(weekly).toBeChecked();
  const savedPrefs = page.waitForResponse("**/api/v1/me/notifications/preferences");
  await weekly.uncheck();
  expect((await savedPrefs).status()).toBe(200);
  await page.goto("/account");
  await expect(weekly).not.toBeChecked();
  await expect(card.getByRole("checkbox", { name: /Session recap/ })).toBeChecked();

  // The data export includes devices (without their keys).
  const exported = await (await page.request.get("/api/v1/me/export?format=json")).json();
  expect(exported.notificationDevices).toEqual([expect.objectContaining({ id: ENDPOINT })]);
  expect(JSON.stringify(exported.notificationDevices)).not.toContain("tBHI");

  // A test to a device that can't be reached says so.
  const test = await page.request.post("/api/v1/me/notifications/test", { headers });
  expect(test.status()).toBe(404);

  const removed = await page.request.delete("/api/v1/me/notifications/subscription", {
    data: { endpoint: ENDPOINT },
    headers,
  });
  expect((await removed.json()).data.endpoints).toEqual([]);
  await page.goto("/account");
  await expect(card.getByRole("group")).toHaveCount(0);
});

test("notification settings need a session, the same origin and valid input", async ({
  request,
  baseURL,
}) => {
  const origin = new URL(baseURL!).origin;
  const put = (path: string, data: unknown, headers: Record<string, string> = { origin }) =>
    request.put(`/api/v1/me/notifications/${path}`, { data, headers });
  expect((await put("subscription", SUBSCRIPTION, {})).status()).toBe(403);
  expect((await put("subscription", SUBSCRIPTION)).status()).toBe(401);
  await request.get(API_LOGIN);
  expect(
    (await put("subscription", { ...SUBSCRIPTION, endpoint: "http://x.example" })).status(),
  ).toBe(400);
  expect((await put("subscription", { endpoint: ENDPOINT })).status()).toBe(400);
  // Only browser push services: the server POSTs to this address.
  const elsewhere = { ...SUBSCRIPTION, endpoint: "https://internal.example/hook" };
  expect((await put("subscription", elsewhere)).status()).toBe(400);
  expect((await put("preferences", { session_recap: true })).status()).toBe(400);
  expect(
    (
      await put("preferences", { session_recap: true, weekly_recap: true, patch_heroes: "yes" })
    ).status(),
  ).toBe(400);
});
