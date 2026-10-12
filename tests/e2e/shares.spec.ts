import { expect, test } from "@playwright/test";

// The fixture account (22202), which has synced matches and sessions.
const LOGIN = "/api/v1/auth/steam/login";
const API_LOGIN = "/api/v1/auth/steam/login?as=76561197960459999";

test("share a session: public page with preview, then remove the link", async ({
  page,
  browser,
  baseURL,
}) => {
  const headers = { origin: new URL(baseURL!).origin };
  await page.goto(LOGIN);
  // The dashboard syncs the fixture matches first; then the latest session has a recap.
  await expect(page.getByText(/Showing \d+ of your 12 matches/).first()).toBeVisible({
    timeout: 20_000,
  });
  await page
    .getByRole("region", { name: /Latest session/ })
    .getByRole("link", { name: "Open recap" })
    .click();
  await expect(page).toHaveURL(/\/sessions\/22202(:|%3A)\d+$/);
  const sessionId = decodeURIComponent(new URL(page.url()).pathname.split("/").pop()!);

  const made = await page.request.post("/api/v1/me/shares", {
    data: { kind: "session", ref: sessionId },
    headers,
  });
  expect(made.status()).toBe(200);
  const { slug, url } = (await made.json()).data;
  expect(url).toMatch(new RegExp(`/s/${slug}$`));

  // Anyone with the link sees the snapshot, without signing in; search engines don't.
  const guest = await browser.newPage();
  await guest.goto(`/s/${slug}`);
  await expect(guest.getByRole("heading", { level: 1 })).toContainText("session");
  await expect(guest.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  // Next adds a hash to the image path inside route groups: take it from the page.
  const imageUrl = await guest.locator('meta[property="og:image"]').getAttribute("content");
  const image = await guest.request.get(imageUrl!);
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toBe("image/png");

  await page.goto("/account");
  const links = page.getByRole("region", { name: "Shared links" });
  await links
    .getByRole("button", { name: /Remove link/ })
    .first()
    .click();
  await expect(links.getByText("You haven't shared anything yet.")).toBeVisible();
  await guest.goto(`/s/${slug}`);
  await expect(guest.getByRole("heading", { name: "This link doesn't work" })).toBeVisible();
  await guest.close();
});

test("sharing needs a session, the same origin and your own session", async ({
  request,
  baseURL,
}) => {
  const headers = { origin: new URL(baseURL!).origin };
  const post = (data: unknown, h = headers) =>
    request.post("/api/v1/me/shares", { data, headers: h });
  expect((await post({ kind: "week" }, {} as typeof headers)).status()).toBe(403);
  expect((await post({ kind: "week" })).status()).toBe(401);
  await request.get(API_LOGIN);
  expect((await post({ kind: "session", ref: "not-a-session" })).status()).toBe(400);
  // Someone else's session (the fixture account's) is not found for this player.
  expect((await post({ kind: "session", ref: "1234:7000000001" })).status()).toBe(404);
  // No ranked games this week: nothing to share.
  expect((await post({ kind: "week" })).status()).toBe(400);
  expect((await request.delete("/api/v1/me/shares/AAAAAAAAAAAA", { headers })).status()).toBe(404);
});
