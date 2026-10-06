import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/** Serious and critical axe violations, as readable lines (rule: element). */
async function seriousViolations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .flatMap((v) =>
      v.nodes.map(
        (n) => `${v.id}: ${n.target.join(" ")} (${n.failureSummary?.split("\n")[1]?.trim() ?? ""})`,
      ),
    );
}

const PUBLIC = [
  "/",
  "/meta",
  "/players",
  "/patches",
  "/draft",
  "/draft/challenges",
  "/guides",
  "/live",
];
const SIGNED_IN = [
  "/dashboard",
  "/matches",
  "/mmr",
  "/sessions",
  "/together",
  "/heroes",
  "/leaderboards",
  "/report",
  "/account",
];

for (const path of PUBLIC) {
  test(`no serious accessibility violations on ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect(await seriousViolations(page)).toEqual([]);
  });
}

for (const path of SIGNED_IN) {
  test(`no serious accessibility violations on ${path} (signed in)`, async ({ page }) => {
    await page.goto("/api/v1/auth/steam/login");
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect(await seriousViolations(page)).toEqual([]);
  });
}

/**
 * Keyboard pass: tab through a page and check every stop is a visible, named control
 * (a hidden or unnamed focus target is unusable without a mouse).
 */
async function keyboardStops(page: Page, max = 60) {
  const stops: Array<{ name: string; tag: string; visible: boolean }> = [];
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    const stop = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      // The end of the page (body), or Next's dev-tools overlay in development.
      if (!el || el === document.body || el.tagName === "NEXTJS-PORTAL") return null;
      const r = el.getBoundingClientRect();
      const name =
        el.getAttribute("aria-label") ??
        (el.getAttribute("aria-labelledby")
          ? document.getElementById(el.getAttribute("aria-labelledby")!)?.textContent
          : null) ??
        (el as HTMLInputElement).labels?.[0]?.textContent ??
        el.textContent ??
        el.getAttribute("title") ??
        "";
      return { name: name.trim(), tag: el.tagName, visible: r.width > 0 && r.height > 0 };
    });
    if (!stop) break;
    stops.push(stop);
  }
  return stops;
}

test("the first tab stop skips to the content", async ({ page }) => {
  await page.goto("/api/v1/auth/steam/login");
  await page.goto("/dashboard");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main$/);
});

for (const path of ["/dashboard", "/draft", "/mmr", "/report"]) {
  test(`every keyboard stop on ${path} is visible and named`, async ({ page }) => {
    await page.goto("/api/v1/auth/steam/login");
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const stops = await keyboardStops(page);
    expect(stops.length).toBeGreaterThan(5);
    expect(stops.filter((s) => !s.visible || s.name === "")).toEqual([]);
  });
}
