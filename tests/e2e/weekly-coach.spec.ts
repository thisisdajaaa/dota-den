import { expect, test, type Page } from "@playwright/test";

// The Monday AI weekly coach (Plus) with the fixture's stand-in for Groq. The default
// identity is an admin (staff have Plus) with 12 games over the last 12 days, so last week
// (Monday to Sunday, Manila time) always has games. QStash isn't configured in tests, so the
// Monday schedule doesn't run here: the note is written from the report page instead, through
// the same service, checker and store (the job itself is covered by unit tests).
const FIXTURE = `http://localhost:${process.env.FIXTURE_PORT ?? 3101}`;
const FREE_LOGIN = "/api/v1/auth/steam/login?as=76561197960469001";

async function modelCalls(page: Page): Promise<number> {
  return (await (await page.request.get(`${FIXTURE}/groq/calls`)).json()).calls;
}

const card = (page: Page) => page.getByRole("region", { name: "Your Monday coach note" });

test("a Plus player's weekly note ends with one fix from their own numbers, written once", async ({
  page,
  baseURL,
}) => {
  const headers = { origin: new URL(baseURL!).origin };
  test.setTimeout(90_000);
  await page.goto("/api/v1/auth/steam/login");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/report");
  const coach = card(page);
  await expect(coach).toContainText("Weekly coach (Plus)");
  await expect(coach).toContainText(/Week of \w{3} \d{1,2} – \w{3} \d{1,2}/);

  // Another spec (or a retry) may have written it already: the note is kept once per week.
  const write = coach.getByRole("button", { name: "Write my note now" });
  if ((await write.count()) > 0) {
    // Right after navigation the button may not be hydrated yet: retry until it answers.
    await expect(async () => {
      if ((await write.count()) > 0) await write.click({ timeout: 2_000 });
      await expect(coach.getByRole("article")).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 30_000 });
  }
  const note = coach.getByRole("article");
  await expect(note.getByRole("heading", { level: 3 })).toContainText("A busy week on");
  const fix = note.getByRole("group", { name: "This week's one fix" });
  await expect(fix).toContainText("Die less before fights");
  // The numbers next to the fix come from our data, not the model's text.
  await expect(fix.getByRole("list", { name: "Based on" })).toContainText(
    "Average deaths per game:",
  );
  await expect(coach).toContainText("It can be wrong");

  // Opening it again is free: no new model call.
  const before = await modelCalls(page);
  await page.reload();
  await expect(card(page).getByRole("article")).toContainText("Die less before fights");
  expect(await modelCalls(page)).toBe(before);

  // The push links to the note's week on the report, which shows the same note.
  const week = await page.request
    .post("/api/v1/report/weekly-coach", { data: {}, headers })
    .then(async (r) => {
      expect(r.status()).toBe(200);
      const body = (await r.json()).data;
      expect(body.status).toBe("cached");
      return body.note.week as string;
    });
  expect(await modelCalls(page)).toBe(before);
  const sunday = new Date(Date.parse(`${week}T00:00:00Z`) + 6 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  await page.goto(`/report?from=${week}&to=${sunday}#weekly-coach`);
  await expect(card(page).getByRole("article")).toContainText("Die less before fights");

  // An unfinished week can't be written.
  const thisMonday = new Date(Date.parse(`${week}T00:00:00Z`) + 7 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const early = await page.request.post("/api/v1/report/weekly-coach", {
    data: { week: thisMonday },
    headers,
  });
  expect(early.status()).toBe(400);
});

test("free players see what the weekly note is, never the note", async ({ page, baseURL }) => {
  await page.goto(FREE_LOGIN);
  await page.goto("/report");
  const coach = card(page);
  await expect(coach).toContainText("Every Monday, Plus members get a short note");
  await expect(coach.getByRole("img", { name: /Preview/ })).toBeVisible();
  await expect(coach.getByRole("link", { name: "See Plus" })).toHaveAttribute("href", "/plus");
  await expect(coach.getByRole("article")).toHaveCount(0);
  await expect(coach.getByRole("button", { name: "Write my note now" })).toHaveCount(0);

  const res = await page.request.post("/api/v1/report/weekly-coach", {
    data: {},
    headers: { origin: new URL(baseURL!).origin },
  });
  expect(res.status()).toBe(403);
});
