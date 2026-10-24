import { describe, expect, it } from "vitest";
import { CoachAnswerSchema } from "@/modules/matches/schemas/coach-review.schema";
import {
  buildCoachFactSheet,
  factLabel,
  factText,
  isKeyItem,
  ungroundedNumbers,
  type CoachFactSheet,
} from "@/modules/matches/domain/coach-facts";
import {
  checkCoachPoints,
  COACH_QUOTA_WINDOW_MS,
  coachQuota,
  resolvePoints,
  type CoachPoint,
} from "@/modules/matches/domain/coach-review";
import { heroName, itemsByKey, ME, parsedMatch, SHEET } from "../support/coach-fixtures";

const sheetFor = (match = parsedMatch(), patch: string | null = "7.41"): CoachFactSheet =>
  buildCoachFactSheet({
    match,
    player: match.players.find((p) => p.accountId32 === ME)!,
    heroName,
    items: itemsByKey,
    patch,
  });

const value = (sheet: CoachFactSheet, key: string) => sheet.facts.find((f) => f.key === key)?.value;

describe("coach fact sheet", () => {
  it("takes only facts we have for the player, rounded as shown", () => {
    const sheet = sheetFor();
    expect(sheet).toMatchObject({ matchId: "7000000012", heroId: 1, heroName: "Anti-Mage" });
    expect(value(sheet, "result")).toBe("win");
    expect(value(sheet, "duration")).toBe(2400);
    expect(value(sheet, "patch")).toBe("7.41");
    expect(value(sheet, "kda")).toBe(5.3);
    expect(value(sheet, "laneRole")).toBe("safe");
    expect(value(sheet, "laneEfficiency")).toBe(74);
    expect(value(sheet, "lastHitsAt10")).toBe(50);
    expect(value(sheet, "goldAt10")).toBe(3_800);
    expect(value(sheet, "stuns")).toBe(12.5);
    expect(value(sheet, "teamfightParticipation")).toBe(60);
    // Your lane (3,800 + partner 3,300) vs the two opponents (3,300 each): within 10%.
    expect(value(sheet, "laneResult")).toBe("even");
    // No healing done: no healing fact (and no healing percentile).
    expect(value(sheet, "heroHealing")).toBeUndefined();
    expect(value(sheet, "benchmark.hero_healing_per_min")).toBeUndefined();
  });

  it("names lane opponents and their numbers, as separate facts", () => {
    const sheet = sheetFor();
    const opp = sheet.facts.filter((f) => f.key.startsWith("opponent"));
    expect(opp.map((f) => [f.key, f.subject, f.value])).toEqual([
      ["opponent1.lastHitsAt10", "Hero 230", 40],
      ["opponent1.goldAt10", "Hero 230", 3_300],
      ["opponent2.lastHitsAt10", "Hero 232", 40],
      ["opponent2.goldAt10", "Hero 232", 3_300],
    ]);
  });

  it("keeps completed item timings only (no consumables, components or recipes)", () => {
    const items = sheetFor().facts.filter((f) => f.base === "itemTiming");
    expect(items.map((f) => [f.key, f.subject, f.value, f.unit])).toEqual([
      ["item.power_treads", "Power Treads", 600, "clock"],
      ["item.bfury", "Battle Fury", 1100, "clock"],
    ]);
    expect(isKeyItem(itemsByKey.get("tango"))).toBe(false);
    expect(isKeyItem(itemsByKey.get("recipe_manta"))).toBe(false);
    expect(isKeyItem(undefined)).toBe(false);
  });

  it("counts team fight deaths by game phase and turns percentiles into 0–100", () => {
    const sheet = sheetFor();
    expect(value(sheet, "teamfightDeaths")).toBe(3);
    expect(value(sheet, "teamfightDeathsLaning")).toBe(1);
    expect(value(sheet, "teamfightDeathsMid")).toBe(2);
    expect(value(sheet, "teamfightDeathsLate")).toBe(0);
    expect(value(sheet, "benchmark.gold_per_min")).toBe(81);
    expect(value(sheet, "benchmark.last_hits_per_min")).toBe(92);
  });

  it("says party is unknown when party_size is missing, never solo", () => {
    const sheet = sheetFor();
    expect(value(sheet, "party")).toBe("unknown");
    expect(sheet.missing).toEqual(["party"]);
    const solo = sheetFor(parsedMatch({ me: { partySize: 1 } }));
    expect(value(solo, "party")).toBe("solo");
    expect(solo.missing).not.toContain("party");
    const duo = sheetFor(parsedMatch({ me: { partySize: 2 } }));
    expect(value(duo, "party")).toBe("party");
    expect(value(duo, "partySize")).toBe(2);
  });

  it("lists what's missing instead of filling it in", () => {
    const bare = sheetFor(
      parsedMatch({
        me: { laning: null, map: null, benchmarks: null, heroDamage: null, partySize: 1 },
      }),
      null,
    );
    expect(bare.missing.sort()).toEqual(
      [
        "patch",
        "damage",
        "laneRole",
        "laningAt10",
        "laneOpponents",
        "itemTimings",
        "wards",
        "teamfightDeaths",
        "benchmarks",
      ].sort(),
    );
    expect(bare.facts.some((f) => f.base === "itemTiming" || f.base === "lastHitsAt10")).toBe(
      false,
    );
    // Missing 10-minute numbers and a roaming player without a lane role.
    const partial = sheetFor(
      parsedMatch({
        me: { laning: { ...parsedMatch().players[0].laning!, laneRole: null, deniesAt10: null } },
      }),
    );
    expect(partial.missing).toEqual(expect.arrayContaining(["laneRole", "laningAt10"]));
    expect(value(partial, "lastHitsAt10")).toBe(50);
  });

  it("writes labels and values for the prompt", () => {
    const sheet = sheetFor();
    const bfury = sheet.facts.find((f) => f.key === "item.bfury")!;
    expect(factLabel(bfury)).toBe("Battle Fury bought at (game clock)");
    expect(factText(bfury)).toBe("18:20");
    const pct = sheet.facts.find((f) => f.key === "benchmark.gold_per_min")!;
    expect(factLabel(pct)).toMatch(/^Gold per minute percentile/);
    expect(factText(pct)).toBe("81%");
  });
});

describe("coach grounding", () => {
  it("accepts numbers from the sheet: as given, rounded, or in thousands", () => {
    expect(ungroundedNumbers("48 last hits and 7 deaths", SHEET)).toEqual([]);
    expect(ungroundedNumbers("3,812 gold (about 3.8k)", SHEET)).toEqual([]);
    expect(ungroundedNumbers("74% lane efficiency, KDA 5.3", SHEET)).toEqual([]);
  });

  it("lets time markers through without a fact", () => {
    for (const text of [
      "by minute 10",
      "around min 18",
      "in the first 10 minutes",
      "a 10-minute target",
      "after 20 min",
      "sa unang 10 minuto",
      "pagkahuman sa minuto 15",
      // Non-breaking hyphen and en dash, as models write them.
      "at the 10\u2011minute mark",
      "sa 10\u2011minuto",
      "a 10\u2013minute target",
      "sa 10 ka minuto",
      "sa unang 10 na minuto",
    ])
      expect(ungroundedNumbers(text, SHEET), text).toEqual([]);
  });

  it("clock times are stats: they must match a fact", () => {
    const bfury = {
      ...SHEET,
      facts: SHEET.facts.map((f) => (f.key === "item.bfury" ? { ...f, value: 1100 } : f)),
    };
    expect(ungroundedNumbers("Battle Fury at 17:00", bfury)).toEqual(["17:00"]);
    expect(ungroundedNumbers("Battle Fury at 18:20", bfury)).toEqual([]);
    expect(ungroundedNumbers("by minute 10", bfury)).toEqual([]);
    // The 10-minute mark is a clock time the sheet backs while it has stats taken at 10 minutes.
    expect(ungroundedNumbers("48 last hits at 10:00", bfury)).toEqual([]);
    expect(ungroundedNumbers("48 last hits at 15:00", bfury)).toEqual(["15:00"]);
    const noLaning = { ...SHEET, facts: SHEET.facts.filter((f) => !/At10$/.test(f.key)) };
    expect(ungroundedNumbers("at 10:00", noLaning)).toEqual(["10:00"]);
    // Times the prompt itself shows in a fact's label ("Team fight deaths after 30:00").
    const phases: CoachFactSheet = {
      ...noLaning,
      facts: [
        ...noLaning.facts,
        {
          key: "teamfightDeathsMid",
          base: "teamfightDeathsMid",
          subject: null,
          value: 0,
          unit: "count",
        },
      ],
    };
    expect(ungroundedNumbers("no team fight deaths from 10:00 to 30:00", phases)).toEqual([]);
    expect(ungroundedNumbers("deaths after 30:00", noLaning)).toEqual(["30:00"]);
    // A fact key quoted in the text isn't a number.
    expect(ungroundedNumbers("48 last hits (lastHitsAt10)", bfury)).toEqual([]);
    expect(ungroundedNumbers("goldAt99 shows it", bfury)).toEqual(["99"]);
  });

  it("keeps the first six facts a point cites instead of rejecting the answer", () => {
    const point = { kind: "strength", title: "Big lane", detail: "Won the lane by a lot." };
    const facts = ["kills", "deaths", "assists", "kda", "gpm", "xpm", "lastHitsAt10"];
    const parsed = CoachAnswerSchema.parse({ points: [{ ...point, facts }] });
    expect(parsed.points[0].facts).toEqual(facts.slice(0, 6));
  });

  it("small numbers and phase marks need a fact like any other number", () => {
    const deaths3 = {
      ...SHEET,
      facts: SHEET.facts.map((f) => (f.key === "deaths" ? { ...f, value: 3 } : f)),
    };
    expect(ungroundedNumbers("You died 4 times", deaths3)).toEqual(["4"]);
    expect(ungroundedNumbers("3 deaths is fine", deaths3)).toEqual([]);
    expect(ungroundedNumbers("Buy 2 wards", SHEET)).toEqual(["2"]);
    expect(ungroundedNumbers("aim for 20 by then", SHEET)).toEqual(["20"]);
  });

  it("flags numbers the sheet doesn't have", () => {
    expect(ungroundedNumbers("You died 12 times", SHEET)).toEqual(["12"]);
    expect(ungroundedNumbers("4,100 gold", SHEET)).toEqual(["4100"]);
    expect(ungroundedNumbers("80% efficiency, KDA 6.1", SHEET)).toEqual(["80", "6.1"]);
  });

  const point = (over: Partial<CoachPoint> = {}): CoachPoint => ({
    kind: "improve",
    title: "Farm faster",
    detail: "48 last hits by minute 10 is a start.",
    factKeys: ["lastHitsAt10"],
    ...over,
  });

  it("needs 3–5 points, each citing known facts, with no invented numbers", () => {
    expect(checkCoachPoints([point(), point(), point()], SHEET).ok).toBe(true);
    const few = checkCoachPoints([point(), point()], SHEET);
    expect(few.ok).toBe(false);
    if (!few.ok) expect(few.error[0]).toMatch(/3 to 5 points/);
    const many = checkCoachPoints(
      Array.from({ length: 6 }, () => point()),
      SHEET,
    );
    expect(many.ok).toBe(false);
    const unknown = checkCoachPoints([point(), point(), point({ factKeys: ["mmr"] })], SHEET);
    expect(!unknown.ok && unknown.error).toEqual(["Point 3 cites unknown facts: mmr."]);
    const none = checkCoachPoints([point(), point(), point({ factKeys: [] })], SHEET);
    expect(!none.ok && none.error).toEqual(["Point 3 cites no facts."]);
    const invented = checkCoachPoints(
      [point(), point(), point({ detail: "Pros have 70 last hits by minute 10." })],
      SHEET,
    );
    expect(!invented.ok && invented.error).toEqual([
      "Point 3 uses numbers that are not in FACTS: 70.",
    ]);
  });

  it("resolves cited facts from the stored sheet", () => {
    const [p] = resolvePoints([point({ factKeys: ["lastHitsAt10", "gone"] })], SHEET);
    expect(p.facts).toEqual([SHEET.facts[1]]);
    expect(p).not.toHaveProperty("factKeys");
  });
});

describe("coach quota (rolling 7 days)", () => {
  const now = new Date("2026-10-23T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);

  it("gives free players one review per window, and Plus unlimited", () => {
    expect(coachQuota([], now, false)).toEqual({
      plan: "free",
      limit: 1,
      remaining: 1,
      resetsAt: null,
    });
    expect(coachQuota([ago(1)], now, true)).toEqual({
      plan: "plus",
      limit: null,
      remaining: null,
      resetsAt: null,
    });
  });

  it("frees a review exactly one window after it was written", () => {
    const used = ago(COACH_QUOTA_WINDOW_MS - 1);
    expect(coachQuota([used], now, false)).toMatchObject({
      remaining: 0,
      resetsAt: new Date(used.getTime() + COACH_QUOTA_WINDOW_MS),
    });
    // At the edge: exactly 7 days old no longer counts.
    expect(coachQuota([ago(COACH_QUOTA_WINDOW_MS)], now, false).remaining).toBe(1);
    expect(coachQuota([ago(COACH_QUOTA_WINDOW_MS + 1)], now, false).remaining).toBe(1);
    // A use "from the future" (clock skew) isn't counted against the player.
    expect(coachQuota([new Date(now.getTime() + 1_000)], now, false).remaining).toBe(1);
  });

  it("with a larger limit, waits for enough old reviews to expire", () => {
    const uses = [ago(6 * 86_400_000), ago(3 * 86_400_000), ago(86_400_000)];
    const q = coachQuota(uses, now, false, { limit: 2 });
    expect(q.remaining).toBe(0);
    // Two of the three must expire before one is free: the second oldest decides.
    expect(q.resetsAt).toEqual(new Date(uses[1].getTime() + COACH_QUOTA_WINDOW_MS));
  });
});
