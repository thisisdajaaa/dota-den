import { expect, test, type Page } from "@playwright/test";
import { attemptSteamId } from "./support/attempt";

// Ask Den (ADR 0015) with the fixture's stand-in for Groq: it calls my_recent_games, then
// answers quoting only the tool's numbers. Its own account with the hero-coaching games (20
// Anti-Mage games, 11 won), so the hero-coaching spec's account is left alone, and a new one
// on a retry (each run uses one of the 5 free questions a Manila day).
const login = () => `/api/v1/auth/steam/login?as=${attemptSteamId("76561197960466002")}`;

const chat = (page: Page) => page.getByRole("region", { name: "Den", exact: true });

async function ask(page: Page, question: string) {
  const box = page.getByRole("textbox", { name: "Your question" });
  // Right after navigation the form may not be hydrated yet: retry until the question shows.
  await expect(async () => {
    await box.fill(question);
    await page.getByRole("button", { name: "Send" }).click({ timeout: 2_000 });
    await expect(chat(page).getByRole("log")).toContainText(question, { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
}

test("Ask Den answers from the player's own games, with its sources, and can be cleared", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto(login());
  await expect(page.getByText("Showing 20 of your 20 matches").first()).toBeVisible({
    timeout: 20_000,
  });
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Ask Den" })
    .click();
  await expect(page).toHaveURL(/\/ask$/);
  await expect(page.getByRole("heading", { level: 1, name: "Ask Den" })).toBeVisible();
  const region = chat(page);
  await expect(region).toContainText(/\d questions? left today/);
  // Starter questions in the player's language.
  await expect(region.getByRole("button", { name: "What should I build on Lion?" })).toBeVisible();

  const left = Number(/(\d+) questions? left/.exec((await region.textContent()) ?? "")?.[1]);
  await ask(page, "Why do I keep losing on Anti-Mage?");
  const log = region.getByRole("log");
  await expect(log).toContainText("In your last 20 games you won 11 (55%).", { timeout: 20_000 });
  await expect(log.getByRole("list", { name: "Based on" })).toContainText("your last 20 games");
  await expect(region).toContainText(`${left - 1} question`);

  // An answer with a number no tool gave is never shown: the safe reply, and nothing counted.
  await ask(page, "INVENT a stat for me");
  await expect(log).toContainText("I couldn't back up an answer with your data", {
    timeout: 20_000,
  });
  await expect(region).not.toContainText("4242");
  await expect(region).toContainText(`${left - 1} question`);

  // The chat is remembered, then cleared.
  await page.reload();
  await expect(log).toContainText("In your last 20 games you won 11 (55%).");
  await region.getByRole("button", { name: "Clear chat" }).click();
  await expect(log).not.toContainText("In your last 20 games");
  await page.reload();
  await expect(region.getByRole("button", { name: "What should I build on Lion?" })).toBeVisible();
});

test("free players get 5 questions a day, then a Plus offer", async ({ page }) => {
  test.setTimeout(90_000);
  // A player with nothing imported: Den says so instead of guessing.
  await page.goto("/api/v1/auth/steam/login?as=76561197960470042");
  await page.goto("/ask");
  const region = chat(page);
  await expect(region).toContainText(/questions? left today|That's all your questions/);
  const left = Number(/(\d+) questions? left/.exec((await region.textContent()) ?? "")?.[1] ?? 0);
  expect(left).toBeLessThanOrEqual(5);
  for (let i = 0; i < left; i++) {
    await ask(page, `How did my games go? (${i})`);
    await expect(region.getByRole("log")).toContainText(
      /I don't have your games yet|In your last/,
      { timeout: 20_000 },
    );
    await expect(region).toContainText(
      i === left - 1 ? "That's all your questions for today" : `${left - i - 1} question`,
    );
  }
  await expect(region).toContainText("That's all your questions for today");
  await expect(region).toContainText("Free players get 5 questions a day");
  await expect(region.getByRole("link", { name: "See Plus" })).toHaveAttribute("href", "/plus");
  await expect(region.getByRole("textbox", { name: "Your question" })).toHaveCount(0);
});
