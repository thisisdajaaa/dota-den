import { expect, test, type Page } from "@playwright/test";

// Identities of their own: a player with no profile (logged MMR only), and the fixture's
// "Fixture Rival" (account 40003), whose public profile shows Legend 4.
const LOGGER_STEAM_ID = "76561197960463001";
const RIVAL_STEAM_ID = "76561197960305731";
const DAY = 86_400_000;

async function logMmr(page: Page, origin: string, entries: Array<[daysAgo: number, mmr: number]>) {
  for (const [daysAgo, mmr] of entries) {
    const res = await page.request.post("/api/v1/mmr-entries", {
      data: { mmr, observedAt: new Date(Date.now() - daysAgo * DAY).toISOString() },
      headers: { origin },
    });
    expect(res.status()).toBe(201);
  }
}

test("the rank journey shows logged MMR peaks, stretches and gaps, by range", async ({
  page,
  baseURL,
}) => {
  const origin = new URL(baseURL!).origin;
  await page.goto(`/api/v1/auth/steam/login?as=${LOGGER_STEAM_ID}`);
  await expect(page).toHaveURL(/\/dashboard/);
  await logMmr(page, origin, [
    [100, 3000],
    [60, 3400],
    [45, 3250],
  ]);

  await page.goto("/mmr");
  await page.getByRole("link", { name: "Rank journey" }).click();
  await expect(page).toHaveURL(/\/mmr\/journey$/);
  await expect(page.getByRole("heading", { level: 1, name: "Rank journey" })).toBeVisible();

  const summary = page.getByRole("region", { name: "Journey summary" });
  await expect(summary).toContainText("3,400");
  await expect(summary).toContainText("3,000");
  await expect(summary).toContainText("No medal seen yet");

  await expect(
    page.getByRole("group", { name: /Rank journey from .*3 logged MMR entries/ }),
  ).toBeVisible();
  // 40 days without an entry: named, not filled in.
  await expect(page.getByText(/No entries for 40 days/)).toBeVisible();

  const climb = page.getByRole("article", { name: "Best logged climb" });
  await expect(climb).toContainText("3,000 → 3,400");
  await expect(climb).toContainText("+400 MMR");
  const slide = page.getByRole("article", { name: "Worst logged slide" });
  await expect(slide).toContainText("3,400 → 3,250");
  await expect(slide).toContainText("−150 MMR");
  await expect(page.getByRole("article", { name: "Best medal climb" })).toContainText(
    "didn't go up",
  );

  // The table alternative lists the same points.
  await page.getByText("Show the timeline as a table").click();
  const table = page.getByRole("table");
  await expect(table.getByRole("row")).toHaveCount(4);
  await expect(table).toContainText("3,250");

  // No medal yet, so nothing to share.
  await expect(page.getByRole("button", { name: "Share" })).toHaveCount(0);

  // Three months: the first entry falls outside.
  await page
    .getByRole("navigation", { name: "Range" })
    .getByRole("link", { name: "3 months" })
    .click();
  await expect(page).toHaveURL(/range=3m/);
  await expect(summary).not.toContainText("3,000");
  await expect(page.getByRole("article", { name: "Best logged climb" })).toContainText(
    "Needs two entries",
  );

  // Bad ranges fall back to the default.
  await page.goto("/mmr/journey?range=%24ne");
  await expect(
    page.getByRole("navigation", { name: "Range" }).getByRole("link", { name: "6 months" }),
  ).toHaveAttribute("aria-current", "page");
});

test("share a medal-only journey: public page and preview, never MMR", async ({
  page,
  browser,
  baseURL,
}) => {
  const origin = new URL(baseURL!).origin;
  await page.goto(`/api/v1/auth/steam/login?as=${RIVAL_STEAM_ID}`);
  await expect(page).toHaveURL(/\/dashboard/);
  await logMmr(page, origin, [
    [30, 4321],
    [5, 4567],
  ]);
  // The overview notes the medal after the page is sent; the journey then shows it.
  await expect
    .poll(
      async () => {
        await page.goto("/mmr/journey");
        return page.getByRole("region", { name: "Journey summary" }).textContent();
      },
      { timeout: 20_000 },
    )
    .toContain("Legend 4");
  await expect(page.getByRole("button", { name: "Share" })).toBeVisible();
  await expect(page.getByText("Never your MMR.")).toBeVisible();

  const made = await page.request.post("/api/v1/me/shares", {
    data: { kind: "journey", range: "6m" },
    headers: { origin },
  });
  expect(made.status()).toBe(200);
  const { slug } = (await made.json()).data;
  // Unknown ranges are rejected.
  expect(
    (
      await page.request.post("/api/v1/me/shares", {
        data: { kind: "journey", range: "5y" },
        headers: { origin },
      })
    ).status(),
  ).toBe(400);

  const guest = await browser.newPage();
  await guest.goto(`/s/${slug}`);
  await expect(guest.getByRole("heading", { level: 1 })).toContainText("rank journey");
  await expect(guest.getByRole("region", { name: "Summary" })).toContainText("Legend 4");
  await expect(guest.getByText("Medals only: logged MMR is never shared.")).toBeVisible();
  const body = (await guest.locator("body").textContent()) ?? "";
  for (const mmr of ["4321", "4,321", "4567", "4,567"]) expect(body).not.toContain(mmr);
  const imageUrl = await guest.locator('meta[property="og:image"]').getAttribute("content");
  expect(new URL(imageUrl!).pathname).toBe(`/og/share/${slug}`);
  const image = await guest.request.get(imageUrl!);
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toBe("image/png");

  await page.goto("/account");
  await expect(page.getByRole("region", { name: "Shared links" })).toContainText(
    "Rank journey (6 months)",
  );
  expect(
    (await page.request.delete(`/api/v1/me/shares/${slug}`, { headers: { origin } })).status(),
  ).toBe(200);
  await guest.goto(`/s/${slug}`);
  await expect(guest.getByRole("heading", { name: "This link doesn't work" })).toBeVisible();
  await guest.close();
});
