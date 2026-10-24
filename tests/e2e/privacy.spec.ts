import { expect, test } from "@playwright/test";
import { E2E_SUPPORT_EMAIL } from "./support/legal";

// The main server runs with SUPPORT_EMAIL set; the second (plain) server without it.
const PLAIN_URL = process.env.E2E_PLAIN_URL ?? "http://localhost:3102";

test("the privacy policy renders, linked from the footer, with the contact address", async ({
  page,
  baseURL,
}) => {
  await page.goto("/");
  await page.getByRole("contentinfo").getByRole("link", { name: "Privacy" }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole("heading", { level: 1, name: "Privacy policy" })).toBeVisible();
  await expect(page).toHaveTitle(/Privacy policy/);
  // A client-side navigation can leave the previous page's canonical in the head; crawlers load fresh.
  await page.reload();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    new URL("/privacy", baseURL).href,
  );

  const policy = page.getByRole("article");
  await expect(policy.getByText(/isn't affiliated with or endorsed by Valve/)).toBeVisible();
  await expect(policy.getByText(/We never see your Steam password/)).toBeVisible();
  for (const heading of [
    "What we keep when you sign in",
    "Cookies and storage on your device",
    "Services that handle your data",
    "How long we keep it",
    "Download or delete your data",
    "Contact",
  ])
    await expect(policy.getByRole("heading", { level: 2, name: heading })).toBeVisible();
  await expect(policy.getByText(/Groq runs our AI features/)).toBeVisible();
  await expect(policy.getByText(/stay with Lemon Squeezy/)).toBeVisible();
  await expect(policy.getByRole("link", { name: E2E_SUPPORT_EMAIL })).toHaveAttribute(
    "href",
    `mailto:${E2E_SUPPORT_EMAIL}`,
  );
  await expect(policy.getByRole("link", { name: "Account page" }).first()).toHaveAttribute(
    "href",
    "/account",
  );
});

test("the terms and refund policy show the same contact address", async ({ page }) => {
  for (const path of ["/terms", "/refunds"]) {
    await page.goto(path);
    await expect(
      page.getByRole("article").getByRole("link", { name: E2E_SUPPORT_EMAIL }),
    ).toHaveAttribute("href", `mailto:${E2E_SUPPORT_EMAIL}`);
  }
});

test("the sign-in note and the Plus page link the privacy policy", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "How we handle your data" }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await page.goto("/plus");
  await expect(page.getByRole("link", { name: "privacy policy" })).toHaveAttribute(
    "href",
    "/privacy",
  );
});

test.describe("without SUPPORT_EMAIL", () => {
  test.use({ baseURL: PLAIN_URL });

  test("the legal pages point to the Account page instead of an address", async ({ page }) => {
    for (const path of ["/privacy", "/terms", "/refunds"]) {
      await page.goto(path);
      const policy = page.getByRole("article");
      await expect(policy.getByText(/doesn't have a support inbox yet/)).toBeVisible();
      await expect(
        policy.getByRole("region", { name: "Contact" }).getByRole("link", { name: "Account page" }),
      ).toHaveAttribute("href", "/account");
      await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
    }
  });
});
