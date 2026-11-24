import { expect, test } from "@playwright/test";

// The fixture account (22202): 12 synced matches, newest two wins (no streak of 3 yet).
const LOGIN = "/api/v1/auth/steam/login";
// Its newest match: a win on Pudge, 5/5/5 in 30:00, nothing that stands out.
const MATCH = "7000000012";

test("share a game as a card: pick the language and size, then copy, download or post it", async ({
  page,
  browser,
  context,
  baseURL,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(LOGIN);
  await expect(page.getByText(/Showing \d+ of your 12 matches/).first()).toBeVisible({
    timeout: 20_000,
  });
  // The latest session card shares too; a 2-win run isn't a streak card yet.
  await expect(
    page.getByRole("region", { name: /Latest session/ }).getByRole("button", { name: "Share" }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: /Win streak/ })).toHaveCount(0);
  const streak = await page.request.post("/api/v1/me/shares", {
    data: { kind: "streak" },
    headers: { origin: new URL(baseURL!).origin },
  });
  expect(streak.status()).toBe(400);

  await page.goto(`/matches/${MATCH}`);
  await page.getByRole("button", { name: "Share" }).click();
  const dialog = page.getByRole("dialog", { name: "Share this" });
  // The site's language by default; any of the three on request.
  await expect(dialog.getByRole("button", { name: "English" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await dialog.getByRole("button", { name: "Filipino" }).click();
  await dialog.getByRole("button", { name: "Square post" }).click();
  const preview = dialog.getByRole("img", { name: "Card preview" });
  await expect(preview).toHaveAttribute("src", /lang=fil&format=square/);
  await expect
    .poll(() => preview.evaluate((img: HTMLImageElement) => img.naturalWidth), { timeout: 20_000 })
    .toBe(1080);

  const [file] = await Promise.all([
    page.waitForEvent("download"),
    dialog.getByRole("link", { name: "Download image" }).click(),
  ]);
  expect(file.suggestedFilename()).toBe("dota-den-match-square-fil.png");

  // Facebook's sharer gets the link (no SDK); it reads the page's preview tags.
  const facebook = await dialog
    .getByRole("link", { name: "Share on Facebook" })
    .getAttribute("href");
  expect(new URL(facebook!).origin + new URL(facebook!).pathname).toBe(
    "https://www.facebook.com/sharer/sharer.php",
  );
  const shared = new URL(new URL(facebook!).searchParams.get("u")!);
  expect(shared.pathname + shared.search).toMatch(/^\/s\/[A-Za-z0-9]{12}\?lang=fil$/);
  await dialog.getByRole("button", { name: "Copy link" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(shared.toString());

  // What Facebook (or anyone) sees: the card in Filipino, and only the player's own line.
  const guest = await browser.newPage();
  await guest.goto(shared.pathname + shared.search);
  await expect(guest.locator('meta[property="og:title"]')).toHaveAttribute(
    "content",
    /Panalo gamit si Pudge!/,
  );
  await expect(guest.locator('meta[property="og:description"]')).toHaveAttribute(
    "content",
    "Panalo · 5/5/5 · 30:00",
  );
  const og = new URL((await guest.locator('meta[property="og:image"]').getAttribute("content"))!);
  expect(og.pathname).toMatch(/^\/og\/share\/[A-Za-z0-9]{12}$/);
  expect(og.searchParams.get("lang")).toBe("fil");
  const image = await guest.request.get(og.pathname + og.search);
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toBe("image/png");
  await expect(guest.getByRole("region", { name: "Summary" })).toContainText("5/5/5");
  const body = (await guest.locator("body").textContent()) ?? "";
  // Other players in the match are never named on a share.
  for (const other of ["Fixture 0", "Fixture 2", "Fixture 128"]) expect(body).not.toContain(other);

  // Same link, square card in Cebuano: a 1080×1080 image.
  const square = await guest.request.get(`${og.pathname}?lang=ceb&format=square`);
  expect(square.status()).toBe(200);
  expect((await square.body()).readUInt32BE(16)).toBe(1080);
  await guest.close();
});

test("only your own games can be shared", async ({ page, baseURL }) => {
  const headers = { origin: new URL(baseURL!).origin };
  // Another player, who wasn't in the fixture account's match.
  await page.request.get("/api/v1/auth/steam/login?as=76561197960459999");
  const post = (data: unknown) => page.request.post("/api/v1/me/shares", { data, headers });
  expect((await post({ kind: "match", ref: MATCH })).status()).toBe(404);
  expect((await post({ kind: "match", ref: "not-a-match" })).status()).toBe(400);
  await page.goto(`/matches/${MATCH}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Share" })).toHaveCount(0);
});

test("share your year in Dota as a card", async ({ page, browser }) => {
  await page.goto(LOGIN);
  await expect(page.getByText(/Showing \d+ of your 12 matches/).first()).toBeVisible({
    timeout: 20_000,
  });
  await page.goto("/report/year");
  const year = new Date().getFullYear();
  // The fixture's games are recent: early in January there may be too few for a card.
  test.skip(
    await page.getByText(`Not enough games in ${year}`).isVisible(),
    "Too few games this year yet",
  );
  await page.getByRole("button", { name: "Share" }).click();
  const dialog = page.getByRole("dialog", { name: "Share this" });
  const preview = dialog.getByRole("img", { name: "Card preview" });
  await expect
    .poll(() => preview.evaluate((img: HTMLImageElement) => img.naturalWidth), { timeout: 20_000 })
    .toBe(1200);
  const [file] = await Promise.all([
    page.waitForEvent("download"),
    dialog.getByRole("link", { name: "Download image" }).click(),
  ]);
  expect(file.suggestedFilename()).toBe("dota-den-year-wide-en.png");

  const facebook = await dialog
    .getByRole("link", { name: "Share on Facebook" })
    .getAttribute("href");
  const shared = new URL(new URL(facebook!).searchParams.get("u")!);
  const guest = await browser.newPage();
  await guest.goto(shared.pathname + shared.search);
  await expect(guest.locator('meta[property="og:title"]')).toHaveAttribute(
    "content",
    new RegExp(`My ${year} in Dota`),
  );
  await expect(guest.getByRole("heading", { level: 1 })).toContainText(`${year} in Dota`);
  await expect(guest.getByRole("region", { name: "Summary" })).toContainText("Time in games");
  await guest.close();
});
