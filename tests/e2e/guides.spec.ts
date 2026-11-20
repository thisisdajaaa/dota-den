import { expect, test } from "@playwright/test";

test("hero guides show pro builds, benchmarks and pro games", async ({ page }) => {
  await page.goto("/meta");
  await page.getByRole("link", { name: "Hero guides" }).click();
  await expect(page).toHaveURL(/\/guides$/);
  await expect(page.getByRole("heading", { level: 1, name: "Hero guides" })).toBeVisible();
  // Search filters as you type, ignoring case and punctuation.
  await page.getByRole("searchbox", { name: "Find a hero" }).fill("anti mage");
  await expect(page.getByRole("link", { name: "Pudge" })).toHaveCount(0);
  await page.getByRole("searchbox", { name: "Find a hero" }).fill("zzz");
  await expect(page.getByRole("status")).toContainText("No hero matches");
  await page.getByRole("searchbox", { name: "Find a hero" }).fill("anti");
  await page
    .getByRole("region", { name: "Agility" })
    .getByRole("link", { name: "Anti-Mage" })
    .click();

  await expect(page).toHaveURL(/\/guides\/1$/);
  await expect(page.getByRole("heading", { level: 1, name: "Anti-Mage" })).toBeVisible();

  // Item builds from STRATZ's high-rank pubs, at the hero's main position.
  const items = page.getByRole("region", { name: "Item builds" });
  await expect(items).toContainText("High-rank pubs");
  await expect(items).toContainText("at Pos 1");
  await expect(items.getByRole("group", { name: "Starting items" })).toContainText("Tango");
  // Consumables and plain components are left out after the start.
  const early = items.getByRole("group", { name: "Early game" });
  await expect(early).toContainText("Magic Wand");
  await expect(early).not.toContainText("Tango");
  await expect(early).not.toContainText("Boots of Speed");
  // The core build in buying order with its typical minute; rarer items are situational.
  const core = items.getByRole("group", { name: "Core build" });
  await expect(core).toContainText("Battle Fury");
  await expect(core).toContainText("15′");
  // Items finished after minute 25 in longer games fill the inventory; rarer ones are situational.
  const late = items.getByRole("group", { name: "Late game" });
  await expect(late).toContainText("Black King Bar");
  await expect(late).toContainText("27′");
  const situational = items.getByRole("group", { name: "Situational" });
  await expect(situational).toContainText("Power Treads");
  await expect(situational).not.toContainText("Black King Bar");
  // Timings: fast and typical minute, with the win rate of the games that built it.
  const timings = items.getByRole("table", { name: "Item timings" });
  await expect(timings.getByRole("row", { name: /Battle Fury/ })).toContainText("15 min");
  await expect(timings.getByRole("row", { name: /Battle Fury/ })).toContainText("55%");
  await expect(timings.getByRole("row", { name: /Black King Bar/ })).toContainText("27 min");
  // Another position the hero is played in: its own build.
  const positions = items.getByRole("navigation", { name: "Positions" });
  await expect(positions.getByRole("link", { name: /Pos 1/ })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await positions.getByRole("link", { name: /Pos 3/ }).click();
  await expect(page).toHaveURL(/\/guides\/1\?pos=3$/);
  await expect(items).toContainText("at Pos 3");
  await page.goto("/guides/1");

  const bench = page.getByRole("region", { name: "What strong games look like" });
  await expect(bench.getByRole("row", { name: /Gold per minute/ })).toContainText("880");
  await expect(bench.getByRole("row", { name: /Last hits per minute/ })).toContainText("8.4");

  // Matchups from STRATZ's high-rank pubs, each opponent linking to its own guide.
  const matchups = page.getByRole("region", { name: "Matchups" });
  await expect(matchups).toContainText("High-rank pubs");
  await expect(matchups).toContainText("Legend to Immortal games (from STRATZ)");
  await expect(matchups.getByRole("group", { name: "Anti-Mage is strong against" })).toBeVisible();
  await expect(matchups.getByRole("group", { name: "Anti-Mage struggles against" })).toBeVisible();
  await expect(matchups.getByRole("link").first()).toHaveAttribute("href", /^\/guides\/\d+$/);

  const pro = page.getByRole("region", { name: "Recent pro games on Anti-Mage" });
  await expect(pro).toContainText("1–1 in the last 2");
  await expect(pro.getByRole("link", { name: /Fixture Pro/ })).toHaveAttribute(
    "href",
    "/matches/7100000001",
  );
  await expect(pro).toContainText("Unnamed player");
});

test("unknown and malformed heroes show not found", async ({ page }) => {
  for (const id of ["999", "abc"]) {
    await page.goto(`/guides/${id}`);
    await expect(page.getByRole("heading", { name: "Hero not found" })).toBeVisible();
  }
});

test("hero images are small resized copies, never through Vercel's image optimizer", async ({
  page,
}) => {
  await page.goto("/guides");
  // Vercel's optimizer has a monthly quota (issue #1): our own resize route instead.
  expect(await page.locator('img[src*="/_next/image"]').count()).toBe(0);
  // A real hero (the fixture also has made-up ones that Steam's CDN doesn't have).
  const src = await page.locator('img[src^="/img/hero/antimage-"]').first().getAttribute("src");
  expect(src).toMatch(/^\/img\/hero\/antimage-\d+\.webp$/);
  const res = await page.request.get(src!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("image/webp");
  expect((await res.body()).length).toBeLessThan(15_000);
});

test.describe("without a STRATZ token", () => {
  // The second app server runs without STRATZ: matchups are OpenDota's, from pro games.
  test.use({ baseURL: process.env.E2E_PLAIN_URL ?? "http://localhost:3102" });

  test("guide matchups and items say they're from pro games", async ({ page }) => {
    await page.goto("/guides/1");
    const items = page.getByRole("region", { name: "What pros buy" });
    await expect(items.getByRole("group", { name: "Mid game" })).toContainText("Battle Fury");
    await expect(items.getByRole("navigation", { name: "Positions" })).toHaveCount(0);
    const matchups = page.getByRole("region", { name: "Matchups" });
    await expect(matchups).toContainText("Pro games");
    await expect(matchups).toContainText("against each hero in pro games");
    await expect(
      matchups.getByRole("group", { name: "Anti-Mage is strong against" }),
    ).toBeVisible();
  });
});

test("ward spots sit on the patch's map, which zooms and pans", async ({ page }) => {
  await page.goto("/guides/wards");
  const wards = page.getByRole("region", { name: "Ward spots" });
  await expect(wards).toContainText("last 40 pro games");
  await expect(wards).toContainText("Patch 7.41 map.");
  await expect(wards.getByRole("img", { name: /most used ward spots/ })).toHaveAttribute(
    "src",
    /minimap-7\.41/,
  );
  await expect(wards.getByText("Spot 1: 20 wards")).toBeAttached();

  const map = wards.getByTestId("zoomable-map");
  await expect(map).toHaveAttribute("data-zoom", "1.00");
  await expect(wards.getByRole("button", { name: "Zoom out" })).toBeDisabled();
  await wards.getByRole("button", { name: "Zoom in" }).click();
  await expect(map).toHaveAttribute("data-zoom", "1.50");
  await wards.getByRole("button", { name: "Zoom in" }).click();
  await expect(map).toHaveAttribute("data-zoom", "2.25");
  // Spots keep their size on screen while the map grows.
  const spot = map.locator("li").first();
  const before = (await spot.boundingBox())!.width;
  // Dragging moves the zoomed map.
  await map.scrollIntoViewIfNeeded();
  const box = (await map.boundingBox())!;
  const imgBefore = (await map.getByRole("img").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 40, { steps: 5 });
  await page.mouse.up();
  const imgAfter = (await map.getByRole("img").boundingBox())!;
  expect(imgAfter.x).toBeGreaterThan(imgBefore.x + 30);
  expect(Math.abs((await spot.boundingBox())!.width - before)).toBeLessThan(2);
  // Double-click zooms in further; reset goes back to the whole map.
  await map.dblclick({ position: { x: 40, y: 40 } });
  await expect(map).toHaveAttribute("data-zoom", "4.50");
  await wards.getByRole("button", { name: "Reset zoom" }).click();
  await expect(map).toHaveAttribute("data-zoom", "1.00");
  await expect(wards.getByRole("button", { name: "Reset zoom" })).toHaveCount(0);
});
