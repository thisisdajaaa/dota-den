import { expect, test } from "@playwright/test";

// Each test has its own identity: tests in a file run in parallel, and both save goals.
const LOGIN = "/api/v1/auth/steam/login?as=76561197960456666";
const API_LOGIN = "/api/v1/auth/steam/login?as=76561197960456667";

test("set weekly goals, mark a custom one done, then clear them", async ({ page }) => {
  await page.goto(LOGIN);
  await expect(page).toHaveURL(/\/dashboard$/);
  const card = page.getByRole("region", { name: "Weekly goals" });
  await expect(card).toBeVisible();

  await card.getByRole("button", { name: "Set goals" }).click();
  await card.getByRole("button", { name: "Add a goal" }).click();
  await card.getByLabel("Goal 1 type").selectOption("logAfterSessions");
  await card.getByRole("button", { name: "Add a goal" }).click();
  await card.getByLabel("Goal 2 type").selectOption("custom");
  await card.getByLabel("Your goal").fill("Buy wards every game");
  await card.getByRole("button", { name: "Save goals" }).click();

  await expect(card.getByText("Log your MMR after every session")).toBeVisible();
  await expect(card.getByText("Buy wards every game")).toBeVisible();
  await expect(card.getByRole("button", { name: "Add a goal" })).toHaveCount(0);

  await card.getByRole("button", { name: "Mark done" }).click();
  await expect(card.getByRole("button", { name: "Not done" })).toBeVisible();

  await card.getByRole("button", { name: "Edit" }).click();
  await card.getByRole("button", { name: "Remove goal 2" }).click();
  await card.getByRole("button", { name: "Remove goal 1" }).click();
  await card.getByRole("button", { name: "Save goals" }).click();
  await expect(card.getByRole("button", { name: "Set goals" })).toBeVisible();
});

test("goals need a session, the same origin and valid goals", async ({ request, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const put = (data: unknown, headers: Record<string, string> = { origin }) =>
    request.put("/api/v1/me/goals", { data, headers });
  expect((await put({ goals: [] }, {})).status()).toBe(403);
  expect((await put({ goals: [] })).status()).toBe(401);
  await request.get(API_LOGIN);
  expect((await put({ goals: [{ type: "winRate", target: 101 }] })).status()).toBe(400);
  expect(
    (
      await put({
        goals: [
          { type: "logAfterSessions" },
          { type: "logAfterSessions" },
          { type: "logAfterSessions" },
        ],
      })
    ).status(),
  ).toBe(400);
  const bad = await put({ goals: [{ type: "winRate", target: 101 }] });
  expect(await bad.json()).toMatchObject({ success: false, code: "bad_request", data: null });
  const ok = await put({ goals: [{ type: "winRate", target: 55 }] });
  expect(ok.status()).toBe(200);
  // The ServiceResponse envelope (ADR 0009).
  expect(await ok.json()).toMatchObject({
    success: true,
    message: "Goals saved",
    statusCode: 200,
    data: { goals: [{ type: "winRate", target: 55 }] },
  });
});
