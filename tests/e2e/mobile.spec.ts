import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

/**
 * Elements poking past the screen edge. `html, body { overflow-x: clip }` would hide page
 * scroll, so check elements instead, skipping decoration, fixed bars and anything inside a
 * container that's meant to scroll sideways (e.g. a wide table).
 */
async function overflowing(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const width = window.innerWidth;
    const scrollsSideways = (el: Element | null): boolean => {
      for (let p = el?.parentElement; p && p !== document.body; p = p.parentElement) {
        const x = getComputedStyle(p).overflowX;
        if (x === "auto" || x === "scroll" || x === "hidden" || x === "clip") return true;
      }
      return false;
    };
    return [...document.querySelectorAll("body *")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        if (el.closest('[aria-hidden="true"], .sr-only, nextjs-portal')) return false;
        if (getComputedStyle(el).position === "fixed") return false;
        if (scrollsSideways(el)) return false;
        return r.right > width + 1 || r.left < -1;
      })
      .slice(0, 5)
      .map(
        (el) =>
          `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} (${Math.round(el.getBoundingClientRect().right)}px)`,
      );
  });
}

async function expectFits(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  expect(await overflowing(page), `${path} overflows at 390px`).toEqual([]);
}

test("public pages fit a phone screen, and guests get navigation", async ({ page }) => {
  for (const path of [
    "/",
    "/meta",
    "/meta?pos=1",
    "/players",
    "/players/22202",
    "/players/compare?a=22202&b=40001",
    "/patches",
    "/patches/7.41",
    "/draft",
    "/draft/challenges",
    "/live",
    "/live/8000000001",
    "/guides",
    "/guides/1",
  ]) {
    await expectFits(page, path);
  }
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link", { name: /Players/ })).toBeVisible();
  await expect(
    page.getByRole("banner").getByRole("link", { name: "Sign in through Steam" }),
  ).toBeVisible();
});

test("signed-in pages fit a phone screen, and the footer isn't hidden by the tab bar", async ({
  page,
}) => {
  test.setTimeout(120_000); // eleven pages
  await page.goto("/api/v1/auth/steam/login");
  for (const path of [
    "/dashboard",
    "/matches",
    "/matches/7000000012",
    "/mmr",
    "/sessions",
    "/together",
    "/together/40001",
    "/heroes",
    "/heroes/1",
    "/meta?pos=4",
    "/leaderboards",
  ]) {
    await expectFits(page, path);
  }
  // A page that doesn't grow while we measure (the dashboard keeps importing matches).
  // Scroll to the very bottom and measure in the same tick: the footer must end above the bar.
  await page.goto("/mmr");
  await page.waitForLoadState("networkidle");
  const gap = await page.evaluate(() => {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
    const footer = document.querySelector("footer")!.getBoundingClientRect();
    // The visible "Main" nav on a phone is the bottom bar (the sidebar's is hidden).
    const bar = [...document.querySelectorAll('nav[aria-label="Main"]')]
      .map((n) => n.getBoundingClientRect())
      .find((r) => r.height > 0)!;
    return bar.top - footer.bottom;
  });
  expect(gap).toBeGreaterThanOrEqual(-1);
});

test("a whole practice draft works and fits on a phone", async ({ page }) => {
  test.setTimeout(90_000); // 18 steps, each waiting on suggestions from the server
  await page.goto("/draft");
  await page.getByRole("combobox", { name: "Opponent" }).click();
  await page.getByRole("option", { name: "Practice both sides" }).click();
  await page.getByRole("combobox", { name: "Ruleset" }).click();
  await page.getByRole("option", { name: "Simple practice" }).click();
  await page.getByRole("button", { name: "Start draft" }).click();
  const suggestions = page.getByRole("region", { name: "Suggestions" });
  const log = page.getByRole("region", { name: "Draft log" });
  for (let step = 1; step <= 18; step++) {
    // Under a busy full-suite run each suggestion can take a few seconds to load.
    await suggestions.getByRole("button").first().click({ timeout: 20_000 });
    await expect(log.getByRole("listitem")).toHaveCount(step, { timeout: 20_000 });
  }
  await expect(page.getByRole("region", { name: "Draft report card" })).toBeVisible();
  expect(await overflowing(page)).toEqual([]);
});
