import { expect, test } from "@playwright/test";

// Both tests use the same fixture account; the second one changes its break length.
test.describe.configure({ mode: "serial" });

test("sessions: list, recap, and notes + goal that persist across reloads", async ({ page }) => {
  await page.goto("/api/v1/auth/steam/login");
  await expect(page).toHaveURL(/\/dashboard$/);
  // The dashboard auto-syncs the 12 fixture matches (one per day).
  await expect(page.getByText("Showing 12 of your 12 matches").first()).toBeVisible({
    timeout: 20_000,
  });
  const latest = page.getByRole("region", { name: /Latest session/ });
  await expect(latest.getByRole("link", { name: "Open recap" })).toBeVisible();

  await page
    .getByRole("navigation", { name: "Main" })
    .first()
    .getByRole("link", { name: "Sessions" })
    .click();
  await expect(page).toHaveURL(/\/sessions$/);
  await expect(page.getByRole("heading", { level: 1, name: "Sessions" })).toBeVisible();
  // One match per day → 12 one-game sessions with the default 1 h break.
  await expect(page.getByText("12 sessions from 12 matches")).toBeVisible();
  const gap = page.getByRole("radiogroup", { name: /New session after a break/ });
  await expect(gap.getByRole("radio", { name: "1 h" })).toHaveAttribute("aria-checked", "true");

  const list = page.getByRole("region", { name: "Recent sessions" });
  const rows = list.locator('a[href^="/sessions/22202:"]');
  await expect(rows).toHaveCount(10);
  await expect(list).toContainText("estimate");
  await list.getByRole("link", { name: "Older sessions" }).click();
  await expect(page).toHaveURL(/\/sessions\?page=2$/);
  await expect(rows).toHaveCount(2);
  await page.getByRole("link", { name: "Newer sessions" }).click();
  await expect(page).toHaveURL(/\/sessions$/);

  // Open the newest session.
  await rows.first().click();
  await expect(page).toHaveURL(/\/sessions\/22202:\d+$/);
  const url = page.url();
  await expect(page.getByText("Session recap")).toBeVisible();
  await expect(page.getByText(/ · 1 game$/)).toBeVisible();
  // Other specs may log MMR for this account in parallel, so exact is possible too; the
  // estimate/exact rules themselves are covered by unit tests.
  await expect(
    page.getByRole("heading", {
      level: 2,
      name: /^[01]–[01] in \d+m, (≈ [+−]25 MMR \(estimate\)|[+−±]\d+ MMR \(exact\))$/,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Matches" }).locator('a[href^="/matches/"]'),
  ).toHaveCount(1);
  await expect(page.getByText(/kills \+ assists − deaths/)).toBeVisible();

  // Client-side validation from the shared schema.
  const form = page.getByRole("form", { name: "Notes and goal" });
  await form.getByRole("radio", { name: "Yes" }).check({ force: true });
  await form.getByRole("button", { name: "Save notes" }).click();
  await expect(form.getByRole("alert")).toContainText("Set a goal");

  await form.getByLabel("Goal").fill("Die fewer than 5 times");
  await form.getByLabel("Notes").fill("Stayed calm after first blood.\nWard the river earlier.");
  await form.getByRole("radio", { name: "Partly" }).check({ force: true });
  await form.getByRole("button", { name: "Save notes" }).click();
  await expect(page.getByText("Session notes saved")).toBeVisible();

  await page.reload();
  const reloaded = page.getByRole("form", { name: "Notes and goal" });
  await expect(reloaded.getByLabel("Goal")).toHaveValue("Die fewer than 5 times");
  await expect(reloaded.getByLabel("Notes")).toHaveValue(
    "Stayed calm after first blood.\nWard the river earlier.",
  );
  await expect(reloaded.getByRole("radio", { name: "Partly" })).toBeChecked();
  expect(page.url()).toBe(url);

  // The list shows the goal and note indicators on that session.
  await page.getByRole("link", { name: "All sessions" }).click();
  const first = page.getByRole("region", { name: "Recent sessions" }).locator("li").first();
  await expect(first).toContainText("Goal partly met");
  await expect(first).toContainText("Notes");
});

test("sessions: gap setting and API guards", async ({ page, request }) => {
  const baseOrigin = new URL(test.info().project.use.baseURL!).origin;
  const body = { note: "x", goal: "", goalMet: null };
  // Cross-origin and signed-out writes are rejected.
  expect(
    (
      await request.put("/api/v1/sessions/22202:7000000001/notes", {
        data: body,
        headers: { origin: "https://evil.example" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.put("/api/v1/sessions/22202:7000000001/notes", {
        data: body,
        headers: { origin: baseOrigin },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await request.put("/api/v1/me/settings/session-gap", {
        data: { gapMinutes: 90 },
        headers: { origin: baseOrigin },
      })
    ).status(),
  ).toBe(401);

  await page.goto("/api/v1/auth/steam/login");
  await expect(page).toHaveURL(/\/dashboard$/);
  const api = page.request;
  // Someone else's account, or an id that isn't a session, is simply not found.
  expect(
    (
      await api.put("/api/v1/sessions/1:7000000001/notes", {
        data: body,
        headers: { origin: baseOrigin },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await api.put("/api/v1/sessions/..%2Fx/notes", {
        data: body,
        headers: { origin: baseOrigin },
      })
    ).status(),
  ).toBe(404);
  const bad = await api.put("/api/v1/me/settings/session-gap", {
    data: { gapMinutes: 45 },
    headers: { origin: baseOrigin },
  });
  expect(bad.status()).toBe(400);

  // Changing the break length is saved and shown as selected.
  await page.goto("/sessions");
  const gap = page.getByRole("radiogroup", { name: /New session after a break/ });
  const saved = page.waitForResponse(
    (r) => r.url().endsWith("/api/v1/me/settings/session-gap") && r.request().method() === "PUT",
  );
  await gap.getByRole("radio", { name: "2 h" }).click();
  expect((await saved).status()).toBe(200);
  await expect(gap.getByRole("radio", { name: "2 h" })).toHaveAttribute("aria-checked", "true");
  await page.reload();
  await expect(
    page.getByRole("radiogroup", { name: /New session after a break/ }).getByRole("radio", {
      name: "2 h",
    }),
  ).toHaveAttribute("aria-checked", "true");
  await gap.getByRole("radio", { name: "1 h" }).click();
  await expect(gap.getByRole("radio", { name: "1 h" })).toHaveAttribute("aria-checked", "true");

  // Unknown session ids get the not-found page.
  await page.goto("/sessions/22202:1");
  await expect(page.getByRole("heading", { name: "Session not found" })).toBeVisible();
});
