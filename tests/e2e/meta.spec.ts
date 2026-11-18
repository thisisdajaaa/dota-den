import { expect, test } from "@playwright/test";

test("guests pick a role and see ranked heroes, lane duos and patch info", async ({ page }) => {
  await page.goto("/meta");
  await expect(
    page.getByRole("heading", { level: 1, name: "What's strong right now" }),
  ).toBeVisible();
  // Guests have no derived role.
  await expect(page.getByRole("region", { name: "Your role" })).toHaveCount(0);
  // Guests get the high-rank default, labelled as such.
  const brackets = page.getByRole("region", { name: "Rank bracket" });
  await expect(
    brackets.getByRole("link", { name: "High ranks: Ancient–Immortal" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(brackets).toContainText("Showing Ancient–Immortal.");
  await expect(brackets).toContainText("These are high-rank games");

  // Real content before a role is picked: the best heroes per role group, placed by STRATZ
  // position stats (the fixture's fake STRATZ).
  const carries = page.getByRole("region", { name: "Top heroes: Carries" });
  await expect(carries.getByRole("listitem")).toHaveCount(3);
  await expect(carries.getByRole("listitem").first()).toContainText(/\d+\.\d% win rate at Pos 1/);
  await expect(carries.getByRole("listitem").first()).toContainText(
    /[\d,]+ games · \d+% of its games/,
  );
  await expect(carries.getByRole("link", { name: "Pos 1 · Safe lane carry" })).toHaveAttribute(
    "href",
    "/meta?pos=1",
  );
  // Fixture Hero 123 is a "Nuker" by its catalog roles, but STRATZ says it's played at Pos 4.
  const supports = page.getByRole("region", { name: "Top heroes: Supports" });
  await expect(supports.getByRole("listitem").first()).toContainText("Fixture Hero 123");
  await expect(supports.getByRole("listitem").first()).toContainText("win rate at Pos 4");
  const cores = page.getByRole("region", { name: "Top heroes: Mid and offlane" });
  await expect(cores).toBeVisible();
  await expect(cores).not.toContainText("Fixture Hero 123");
  const overview = page.getByRole("region", { name: "Strongest heroes right now" });
  await expect(overview).toContainText("Source: STRATZ public games at Ancient–Immortal");
  await expect(overview.getByRole("link", { name: "STRATZ" })).toHaveAttribute(
    "href",
    "https://stratz.com",
  );
  await expect(page.getByRole("region", { name: "Most contested" })).toContainText(
    "Picked or banned in 120 pro drafts over the last 21 days",
  );

  await page
    .getByRole("navigation", { name: "Choose your role" })
    .getByRole("link", { name: /Safe lane carry/ })
    .click();
  await expect(page).toHaveURL(/\/meta\?pos=1$/);

  const heroes = page.getByRole("region", { name: "Top heroes: Safe lane carry" });
  const rows = heroes.getByRole("listitem");
  await expect(rows.first()).toContainText(
    /\d+\.\d% win rate at Pos 1 · [\d,]+ games \(\d+% of its games\)/,
  );
  expect(await rows.count()).toBeGreaterThanOrEqual(3);
  await expect(heroes).toContainText("Pos 1, Ancient–Immortal,");
  await expect(heroes).toContainText("Position stats: STRATZ public games at Ancient–Immortal");
  await expect(heroes).toContainText("Pick trends: OpenDota public games");
  await expect(heroes.getByRole("link", { name: "STRATZ" })).toHaveAttribute(
    "href",
    "https://stratz.com",
  );
  await expect(rows.first()).toContainText(
    /Tournaments: [\d,]+ picks? · [\d,]+ bans? in 120 pro drafts/,
  );
  // The named fixture heroes sit at 48% and never top the list.
  await expect(rows.first()).not.toContainText("Anti-Mage");
  await expect(heroes).toContainText("Tournaments: 120 pro drafts in the last 21 days");

  const duos = page.getByRole("region", { name: "Strongest lane duos" });
  await expect(duos).toContainText("in pro matches over the last 60 days");
  await expect(duos.getByRole("listitem").first()).toContainText(
    /Fixture Hero \d+ \+ Fixture Hero \d+/,
  );
  await expect(duos.getByRole("listitem").first()).toContainText(/win rate · \d+ games/);
  // Pairs under 8 games are left out.
  await expect(duos).not.toContainText("Fixture Hero 101 + Fixture Hero 102");

  const tips = page.getByRole("region", { name: "Patch tips" });
  await expect(tips).toContainText("Patch 7.41");
  await expect(page.getByRole("link", { name: "7.41" })).toHaveAttribute("href", "/patches/7.41");

  // Switching role with the tabs.
  await page
    .getByRole("navigation", { name: "Position" })
    .getByRole("link", { name: /Mid/ })
    .click();
  await expect(page).toHaveURL(/\/meta\?pos=2$/);
  await expect(page.getByRole("region", { name: "Top heroes: Mid" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Strongest lane duos" })).toContainText(
    "Mid is a solo lane",
  );
});

test("guests pick a rank bracket and get a shareable, clearly labelled ranking", async ({
  page,
}) => {
  await page.goto("/meta");
  await page
    .getByRole("navigation", { name: "Rank bracket" })
    .getByRole("link", { name: "Herald–Guardian" })
    .click();
  await expect(page).toHaveURL(/\/meta\?bracket=herald-guardian$/);
  await expect(page).toHaveTitle(/Meta: Herald–Guardian/);
  const brackets = page.getByRole("region", { name: "Rank bracket" });
  await expect(brackets).toContainText("Showing Herald–Guardian.");
  await expect(brackets).toContainText("not from pro or high-rank games");

  const overview = page.getByRole("region", { name: "Strongest heroes in Herald–Guardian" });
  await expect(overview).toContainText(
    /Herald–Guardian win rates: OpenDota public ranked games \([\d,]+ matches\)/,
  );
  await expect(overview).toContainText(
    "Who plays each position comes from STRATZ Ancient–Immortal games",
  );
  const carries = page.getByRole("region", { name: "Top heroes: Carries" });
  await expect(carries.getByRole("listitem").first()).toContainText(/\d+\.\d% win rate/);
  await expect(carries.getByRole("listitem").first()).toContainText(
    /[\d,]+ games in Herald–Guardian/,
  );
  await expect(carries.getByRole("link", { name: "Pos 1 · Safe lane carry" })).toHaveAttribute(
    "href",
    "/meta?pos=1&bracket=herald-guardian",
  );

  // The link is shareable: opening it directly shows the same bracket and position.
  await page.goto("/meta?pos=1&bracket=herald-guardian");
  const heroes = page.getByRole("region", { name: "Top heroes: Safe lane carry" });
  await expect(heroes).toContainText("Herald–Guardian games");
  await expect(heroes).toContainText("Pos 1, Herald–Guardian public games");
  const rows = heroes.getByRole("listitem");
  await expect(rows.first()).toContainText(
    /\d+\.\d% win rate in Herald–Guardian · [\d,]+ games · picked in \d+\.\d% of matches/,
  );
  await expect(rows.first()).toContainText(/Plays Pos 1 in \d+% of its Ancient–Immortal games/);
  await expect(heroes).toContainText("Tournament picks don't count in bracket rankings.");
  await expect(heroes).not.toContainText("Tournaments:");
  // Position tabs keep the bracket.
  await expect(
    page.getByRole("navigation", { name: "Position" }).getByRole("link", { name: /Mid/ }),
  ).toHaveAttribute("href", "/meta?pos=2&bracket=herald-guardian");
  // Pro data is still pro data, and says so.
  await expect(page.getByRole("region", { name: "Strongest lane duos" })).toContainText(
    "in pro matches",
  );
});

test("signed-in users see the role derived from their recent lanes", async ({ page }) => {
  await page.goto("/api/v1/auth/steam/login");
  await page.goto("/meta");

  const role = page.getByRole("region", { name: "Your role" });
  // Fixture history: 8 safe-lane Anti-Mage games and 4 off-lane Pudge games.
  await expect(role).toContainText("Pos 1 · Safe lane carry");
  await expect(role).toContainText("Based on your last 12 games with lane data");
  await expect(role.getByRole("list", { name: "Games by position" })).toContainText(
    "Pos 3: 4 games",
  );

  const tabs = page.getByRole("navigation", { name: "Position" });
  await expect(tabs.getByRole("link", { name: /Safe lane carry \(you\)/ })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("region", { name: "Top heroes: Safe lane carry" })).toBeVisible();

  // The fixture player is Immortal: their bracket is the default, and the page says so.
  const brackets = page.getByRole("region", { name: "Rank bracket" });
  await expect(brackets).toContainText("Showing your bracket: Divine–Immortal.");
  await expect(brackets.getByRole("link", { name: "Divine–Immortal (you)" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("region", { name: "Top heroes: Safe lane carry" })).toContainText(
    "Pos 1, Divine–Immortal public games",
  );

  // Picking another bracket overrides it, with a way back.
  await page.goto("/meta?bracket=ancient-immortal");
  await expect(brackets).toContainText("Showing Ancient–Immortal.");
  await expect(
    brackets.getByRole("link", { name: "Show your bracket (Divine–Immortal)" }),
  ).toHaveAttribute("href", "/meta?bracket=divine-immortal");
});

test.describe("without a STRATZ token", () => {
  // The second app server runs without STRATZ: the Meta page reads positions from OpenDota.
  test.use({ baseURL: process.env.E2E_PLAIN_URL ?? "http://localhost:3102" });

  test("heroes are placed by OpenDota lane data and roles, as before", async ({ page }) => {
    await page.goto("/meta");
    const overview = page.getByRole("region", { name: "Strongest heroes right now" });
    await expect(overview).toContainText("Source: OpenDota high-rank games and lane data");
    await expect(overview.getByRole("link", { name: "STRATZ" })).toHaveCount(0);
    const carries = page.getByRole("region", { name: "Top heroes: Carries" });
    await expect(carries.getByRole("listitem").first()).toContainText(/\d+\.\d% win rate/);
    await expect(carries).not.toContainText("win rate at Pos");

    await page.goto("/meta?pos=1");
    const rows = page
      .getByRole("region", { name: "Top heroes: Safe lane carry" })
      .getByRole("listitem");
    await expect(rows.first()).toContainText("win rate at high ranks");
    await expect(rows.first()).toContainText(/Safe lane: \d+\.\d% win rate · [\d,]+ games/);

    // A bracket still works without STRATZ, placed by OpenDota lane data (and says so).
    await page.goto("/meta?pos=1&bracket=crusader-archon");
    const heroes = page.getByRole("region", { name: "Top heroes: Safe lane carry" });
    await expect(heroes.getByRole("listitem").first()).toContainText(
      /win rate in Crusader–Archon · [\d,]+ games/,
    );
    await expect(heroes).toContainText(
      "Who plays each position comes from OpenDota lane data (public parsed games at all ranks)",
    );
    await expect(heroes.getByRole("link", { name: "STRATZ" })).toHaveCount(0);
  });
});
