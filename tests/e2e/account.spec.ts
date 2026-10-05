import { expect, test } from "@playwright/test";

// Its own test identity: this spec deletes the account.
const LOGIN = "/api/v1/auth/steam/login?as=76561197960455555";

test("download your data, then delete your account", async ({ page }) => {
  await page.goto(LOGIN);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Your data" })
    .click();
  await expect(page).toHaveURL(/\/account$/);

  const json = await page.request.get("/api/v1/me/export?format=json");
  expect(json.status()).toBe(200);
  expect(json.headers()["content-disposition"]).toMatch(/attachment; filename="dota-den-data-/);
  expect(await json.json()).toMatchObject({
    exportedAt: expect.any(String),
    account: expect.any(Array),
  });
  const csv = await page.request.get("/api/v1/me/export?format=mmr-csv");
  expect((await csv.text()).split("\n")[0]).toBe("observedAt,mmr,note,createdAt");

  // The button stays disabled until DELETE is typed.
  const del = page.getByRole("button", { name: "Delete my account" });
  await expect(del).toBeDisabled();
  await page.getByLabel(/Type DELETE to confirm/).fill("DELETE");
  await del.click();
  await expect(page).toHaveURL(/\/\?deleted=1$/);
  await expect(
    page.getByRole("alert").filter({ hasText: "Your account was deleted" }),
  ).toBeVisible();
  expect((await page.request.get("/api/v1/me")).status()).toBe(401);
});

test("delete needs the typed confirmation, a session and the same origin", async ({
  request,
  baseURL,
}) => {
  const origin = new URL(baseURL!).origin;
  expect((await request.post("/api/v1/me/delete", { data: { confirm: "DELETE" } })).status()).toBe(
    403,
  );
  expect(
    (
      await request.post("/api/v1/me/delete", { data: { confirm: "DELETE" }, headers: { origin } })
    ).status(),
  ).toBe(401);
  expect((await request.get("/api/v1/me/export")).status()).toBe(401);
});
