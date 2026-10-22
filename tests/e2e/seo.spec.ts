import { expect, test, type Page } from "@playwright/test";

const canonical = (page: Page) => page.locator('link[rel="canonical"]').getAttribute("href");

test("filtered and paged public pages name one canonical URL", async ({ page, baseURL }) => {
  for (const [path, expected] of [
    ["/?auth_error=signed_out", "/"],
    ["/meta?pos=1", "/meta"],
    ["/patches?cursor=7.41", "/patches"],
    ["/players", "/players"],
    ["/live", "/live"],
    ["/guides", "/guides"],
  ]) {
    await page.goto(path);
    const url = new URL((await canonical(page)) ?? "", baseURL);
    expect(url.origin + url.pathname + url.search, path).toBe(new URL(expected, baseURL).href);
  }

  await page.goto("/guides");
  const guide = page.locator('a[href^="/guides/"]').first();
  const href = await guide.getAttribute("href");
  await page.goto(`${href}?utm_source=test`);
  expect(await canonical(page)).toBe(new URL(href!, baseURL).href);
});

test("link previews default to a large image card from Dota Den", async ({ page }) => {
  await page.goto("/guides");
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    "content",
    "summary_large_image",
  );
  await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute(
    "content",
    "Dota Den",
  );
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute("content", "website");
});
