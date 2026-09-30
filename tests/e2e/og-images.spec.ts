import { expect, test, type Page, type APIRequestContext } from "@playwright/test";

/** Read a page's og:image the way a chat app does, then fetch it. */
async function previewOf(page: Page, request: APIRequestContext, path: string) {
  await page.goto(path);
  const og = await page.locator('meta[property="og:image"]').first().getAttribute("content");
  expect(og, path).toBeTruthy();
  const url = new URL(og!);
  const res = await request.get(url.pathname + url.search);
  return { url, res };
}

test("link previews render for the site, matches and players", async ({ page, request }) => {
  for (const path of ["/", "/matches/7000000012", "/players/22202"]) {
    const { url, res } = await previewOf(page, request, path);
    expect(url.protocol, path).toMatch(/^https?:$/);
    expect(res.status(), path).toBe(200);
    expect(res.headers()["content-type"], path).toContain("image/png");
  }
});

test("a shared draft's preview shows the draft", async ({ page, request, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/draft");
  await page.getByRole("button", { name: "Start draft" }).click();
  await page
    .getByRole("region", { name: "Heroes" })
    .getByRole("button", { name: "ban Pudge" })
    .click();
  await page.getByRole("button", { name: "Share" }).click();
  const shared = new URL(await page.evaluate(() => navigator.clipboard.readText()));

  const { url, res } = await previewOf(page, request, shared.pathname + shared.search);
  expect(url.pathname).toBe("/api/og/draft");
  expect(res.headers()["content-type"]).toContain("image/png");

  // A bad snapshot still gets a generic image, never an error.
  expect((await request.get("/api/og/draft?snapshot=not-a-draft")).status()).toBe(200);
});
