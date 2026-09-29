import { expect, test, type Page } from "@playwright/test";

// A tall viewport makes every page "short", so the footer must be pushed to the bottom.
test.use({ viewport: { width: 1440, height: 2400 } });

async function footerGap(page: Page): Promise<number> {
  const box = await page.locator("footer").boundingBox();
  if (!box) throw new Error("footer not rendered");
  return 2400 - (box.y + box.height);
}

test("the footer sits at the bottom of short pages for guests", async ({ page }) => {
  await page.goto("/draft");
  expect(await footerGap(page)).toBeLessThanOrEqual(1);
});

test("the footer sits at the bottom of short pages when signed in", async ({ page }) => {
  await page.goto("/api/v1/auth/steam/login");
  await page.goto("/mmr");
  expect(await footerGap(page)).toBeLessThanOrEqual(1);
});
