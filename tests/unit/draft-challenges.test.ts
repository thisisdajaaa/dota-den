import { describe, expect, it, vi } from "vitest";
import { ChallengeService } from "@/modules/drafts/application/challenge-service";
import type { DraftInsights } from "@/modules/drafts/application/ports";
import {
  availableIds,
  CHALLENGE_TYPES,
  generatePuzzle,
  gradeAnswer,
  gradeForRank,
  isValidSeed,
  newSeed,
  validateAnswer,
  type Puzzle,
} from "@/modules/drafts/domain/challenges";
import {
  lineupRole,
  type HeroMeta,
  type MatchupTable,
  type ScoringHero,
} from "@/modules/drafts/domain/draft-scoring";
import { parseProgress, recordResult } from "@/modules/drafts/ui/challenge-progress";

// 60 heroes: every third is a support; some cores can also support.
const catalog: ScoringHero[] = Array.from({ length: 60 }, (_, i) => {
  const id = i + 1;
  const roles =
    id % 3 === 0 ? ["Support", "Disabler"] : id % 5 === 0 ? ["Nuker", "Support"] : ["Carry"];
  return { id, name: `Hero ${id}`, roles };
});
const byId = new Map(catalog.map((h) => [h.id, h]));
const roleCount = (ids: number[]) => {
  const supports = ids.filter((id) => lineupRole(byId.get(id)!) === "support").length;
  return { cores: ids.length - supports, supports };
};
const SEEDS = ["abcd", "seed42", "zz9zz9", "0000", "q1w2e3r4", "longerseedvalue1"];

/** A last-pick position where your team already has 3 cores (so it needs a support). */
function threeCoreLastPick(): Puzzle {
  for (let i = 0; i < 100; i++) {
    const p = puzzle("last_pick", `lp${1000 + i}`);
    if (roleCount(p.yourPicks).cores === 3) return p;
  }
  throw new Error("no 3-core position");
}

function puzzle(type: string, seed = "seed42"): Puzzle {
  const res = generatePuzzle(type, seed, catalog);
  if (!res.ok) throw new Error(res.error.type);
  return res.value;
}

describe("challenge generation", () => {
  it("is deterministic for the same type and seed, whatever the catalog order", () => {
    for (const type of CHALLENGE_TYPES) {
      const a = generatePuzzle(type, "seed42", catalog);
      const b = generatePuzzle(type, "seed42", [...catalog].reverse());
      expect(a).toEqual(b);
    }
    expect(puzzle("last_pick", "abcd")).not.toEqual(puzzle("last_pick", "seed42"));
  });

  it.each(CHALLENGE_TYPES)("builds legal %s positions (no duplicates, sensible roles)", (type) => {
    for (const seed of SEEDS) {
      const p = puzzle(type, seed);
      const all = [...p.yourPicks, ...p.enemyPicks, ...p.bans];
      expect(new Set(all).size).toBe(all.length);
      expect(all.every((id) => byId.has(id))).toBe(true);
      for (const team of [p.yourPicks, p.enemyPicks]) {
        const { cores, supports } = roleCount(team);
        expect(cores).toBeLessThanOrEqual(3);
        expect(supports).toBeLessThanOrEqual(2);
      }
      expect(p.yourPicksLeft).toBe(5 - p.yourPicks.length);
      expect(p.enemyPicksLeft).toBe(5 - p.enemyPicks.length);
      expect(availableIds(p, catalog).length).toBeGreaterThanOrEqual(10);
    }
  });

  it("last pick is 4 v 5 after all 14 bans", () => {
    for (const seed of SEEDS) {
      const p = puzzle("last_pick", seed);
      expect(p.yourPicks).toHaveLength(4);
      expect(p.enemyPicks).toHaveLength(5);
      expect(p.bans).toHaveLength(14);
      expect(roleCount(p.enemyPicks)).toEqual({ cores: 3, supports: 2 });
      expect(p).toMatchObject({ action: "pick", answerCount: 1, yourPicksLeft: 1 });
    }
  });

  it("shapes the other challenge types", () => {
    for (const seed of SEEDS) {
      const counter = puzzle("counter_pick", seed);
      expect(counter.enemyPicks.length).toBeGreaterThanOrEqual(1);
      expect(counter.enemyPicks.length).toBeLessThanOrEqual(3);
      const ban = puzzle("ban_priority", seed);
      expect([2, 3]).toContain(ban.yourPicks.length);
      expect(ban.action).toBe("ban");
      const opening = puzzle("first_phase_bans", seed);
      expect(opening).toMatchObject({ yourPicks: [], enemyPicks: [], answerCount: 2 });
      expect(opening.bans).toHaveLength(2);
    }
  });

  it("rejects unknown types, bad seeds and tiny catalogs", () => {
    expect(generatePuzzle("mid_only", "seed42", catalog)).toEqual({
      ok: false,
      error: { type: "invalid_type" },
    });
    for (const seed of ["", "abc", "UPPER", "has space", "x".repeat(25), "../etc"]) {
      expect(generatePuzzle("last_pick", seed, catalog)).toMatchObject({
        ok: false,
        error: { type: "invalid_seed" },
      });
    }
    expect(generatePuzzle("last_pick", "seed42", catalog.slice(0, 12))).toMatchObject({
      ok: false,
      error: { type: "not_enough_heroes" },
    });
  });

  it("new seeds are valid", () => {
    expect(isValidSeed(newSeed())).toBe(true);
    expect(newSeed(() => 0)).toBe("aaaaaaaa");
  });
});

describe("answer validation", () => {
  const p = puzzle("last_pick");
  const free = availableIds(p, catalog);

  it("accepts an available hero", () => {
    expect(validateAnswer(p, catalog, [free[0]])).toEqual({ ok: true, value: [free[0]] });
  });

  it("rejects picked, banned and unknown heroes", () => {
    for (const id of [p.yourPicks[0], p.enemyPicks[0], p.bans[0], 9999]) {
      expect(validateAnswer(p, catalog, [id])).toEqual({
        ok: false,
        error: { type: "unavailable", heroId: id },
      });
    }
  });

  it("rejects the wrong number of heroes and duplicates", () => {
    expect(validateAnswer(p, catalog, [free[0], free[1]])).toMatchObject({
      ok: false,
      error: { type: "wrong_count", expected: 1 },
    });
    const opening = puzzle("first_phase_bans");
    const open = availableIds(opening, catalog);
    expect(validateAnswer(opening, catalog, [open[0], open[0]])).toMatchObject({
      ok: false,
      error: { type: "duplicate" },
    });
  });
});

describe("grading", () => {
  it("bands by rank", () => {
    expect(gradeForRank(1, 40)).toBe("excellent");
    expect(gradeForRank(3, 40)).toBe("excellent");
    expect(gradeForRank(4, 40)).toBe("good");
    expect(gradeForRank(10, 40)).toBe("good");
    expect(gradeForRank(11, 40)).toBe("playable");
    expect(gradeForRank(30, 40)).toBe("playable");
    expect(gradeForRank(31, 40)).toBe("risky");
    expect(gradeForRank(40, 40)).toBe("risky");
    // Small pools never call a top-10 hero risky.
    expect(gradeForRank(10, 11)).toBe("good");
  });

  // Win rate rises with hero id, so the ranking is predictable.
  const meta = new Map<number, HeroMeta>(
    catalog.map((h) => [h.id, { games: 100_000, wins: (0.4 + h.id / 300) * 100_000 }]),
  );
  const noMatchups = new Map<number, MatchupTable>();

  it("grades the top choices Excellent and explains them with facts", () => {
    const p = puzzle("counter_pick");
    const free = availableIds(p, catalog);
    const res = gradeAnswer(p, catalog, [free[free.length - 1]], { meta, matchups: noMatchups });
    expect(res.basis).toBe("stats");
    expect(res.best).toHaveLength(3);
    expect(res.best[0].facts.join(" ")).toMatch(/win rate at high ranks/);
    const bestPick = gradeAnswer(p, catalog, [res.best[0].heroId], {
      meta,
      matchups: noMatchups,
    });
    expect(bestPick.grade).toBe("excellent");
    expect(bestPick.choices[0]).toMatchObject({ rank: 1, fitsLineup: true });
    expect(bestPick.choices[0].facts.join(" ")).toMatch(/win rate at high ranks/);
    expect(bestPick.disclaimer).toMatch(/lanes and players/);
    expect(JSON.stringify(bestPick)).not.toMatch(/probabilit/i);
  });

  it("uses head-to-head matchups against the enemy", () => {
    const p = puzzle("last_pick");
    const free = availableIds(p, catalog);
    const target = free[0]; // lowest win rate of the free heroes, but crushes the enemy
    // Lineup rules may exclude it; pick a free hero that fits.
    const fitting = gradeAnswer(p, catalog, [target], { meta, matchups: noMatchups });
    const candidate = fitting.choices[0].fitsLineup
      ? target
      : free.find(
          (id) =>
            gradeAnswer(p, catalog, [id], { meta, matchups: noMatchups }).choices[0].fitsLineup,
        )!;
    const matchups = new Map<number, MatchupTable>(
      p.enemyPicks.map((e) => [e, new Map([[candidate, { games: 1_000, wins: 200 }]])]),
    );
    const res = gradeAnswer(p, catalog, [candidate], { meta, matchups });
    expect(res.grade).toBe("excellent");
    expect(res.choices[0].facts.join(" ")).toMatch(/vs opponent's Hero \d+ \+[1-9]\d\.\d%/);
  });

  it("calls the bottom band and lineup-breaking picks Risky", () => {
    const p = puzzle("ban_priority");
    const free = availableIds(p, catalog);
    const worst = gradeAnswer(p, catalog, [free[0]], { meta, matchups: noMatchups });
    expect(worst.grade).toBe("risky");

    // Last pick with 3 cores already: a pure core breaks the lineup.
    const lp = threeCoreLastPick();
    const core = availableIds(lp, catalog).find((id) => !byId.get(id)!.roles.includes("Support"))!;
    const res = gradeAnswer(lp, catalog, [core], { meta, matchups: noMatchups });
    expect(res.grade).toBe("risky");
    expect(res.choices[0]).toMatchObject({ fitsLineup: false, rank: null });
    expect(res.choices[0].verdict).toMatch(/needs a support/);
  });

  it("grades two opening bans by the weaker one", () => {
    const p = puzzle("first_phase_bans");
    const free = availableIds(p, catalog);
    const top = free.slice(-2);
    expect(gradeAnswer(p, catalog, top, { meta, matchups: noMatchups }).grade).toBe("excellent");
    const mixed = gradeAnswer(p, catalog, [free[free.length - 1], free[0]], {
      meta,
      matchups: noMatchups,
    });
    expect(mixed.choices.map((c) => c.grade)).toEqual(["excellent", "risky"]);
    expect(mixed.grade).toBe("risky");
  });

  it("falls back to role-fit grading with a notice when there is no data", () => {
    const empty = { meta: new Map(), matchups: new Map() };
    const lp = threeCoreLastPick();
    const free = availableIds(lp, catalog);
    const support = free.find((id) => lineupRole(byId.get(id)!) === "support")!;
    const flex = free.find((id) => byId.get(id)!.roles[1] === "Support")!;
    const good = gradeAnswer(lp, catalog, [support], empty);
    expect(good).toMatchObject({ grade: "good", basis: "role_fit", best: [] });
    expect(good.notice).toMatch(/stats are unavailable/);
    expect(gradeAnswer(lp, catalog, [flex], empty).grade).toBe("playable");
  });
});

describe("ChallengeService", () => {
  it("re-generates the puzzle, rejects illegal answers and grades legal ones", async () => {
    const insights: DraftInsights = {
      heroMeta: vi.fn(async () => new Map([[1, { games: 1_000, wins: 600 }]])),
      matchups: vi.fn(async () => null),
    };
    const svc = new ChallengeService({ insights, heroes: catalog });
    const p = puzzle("ban_priority");
    const illegal = await svc.grade("ban_priority", "seed42", [p.yourPicks[0]]);
    expect(illegal).toMatchObject({
      ok: false,
      error: { type: "illegal_answer", cause: { type: "unavailable" } },
    });
    expect(insights.heroMeta).not.toHaveBeenCalled();

    const free = availableIds(p, catalog);
    const graded = await svc.grade("ban_priority", "seed42", [free[0]]);
    expect(graded.ok).toBe(true);
    // Bans look at matchups against your own heroes.
    expect(insights.matchups).toHaveBeenCalledTimes(p.yourPicks.length);
    expect(await svc.grade("nope", "seed42", [1])).toMatchObject({
      ok: false,
      error: { type: "invalid_type" },
    });
  });

  it("degrades to role-fit grading when insights fail", async () => {
    const insights: DraftInsights = {
      heroMeta: vi.fn(async () => {
        throw new Error("down");
      }),
      matchups: vi.fn(async () => {
        throw new Error("down");
      }),
    };
    const svc = new ChallengeService({ insights, heroes: catalog });
    const p = puzzle("counter_pick");
    const res = await svc.grade("counter_pick", "seed42", [availableIds(p, catalog)[0]]);
    expect(res).toMatchObject({ ok: true, value: { result: { basis: "role_fit" } } });
    const none = new ChallengeService({ insights: null, heroes: catalog });
    expect(await none.grade("counter_pick", "seed42", [availableIds(p, catalog)[0]])).toMatchObject(
      { ok: true, value: { result: { basis: "role_fit" } } },
    );
  });
});

describe("challenge progress", () => {
  const entry = (seed: string, grade: "excellent" | "risky") => ({
    type: "last_pick" as const,
    seed,
    grade,
    answer: ["Hero 1"],
    at: "2026-09-30T00:00:00Z",
  });

  it("tracks streak, best streak and ignores replays", () => {
    let p = parseProgress("{}");
    p = recordResult(p, entry("aaaa", "excellent")).progress;
    p = recordResult(p, entry("bbbb", "excellent")).progress;
    expect(p).toMatchObject({ streak: 2, best: 2 });
    const replay = recordResult(p, entry("aaaa", "risky"));
    expect(replay.counted).toBe(false);
    expect(replay.progress.streak).toBe(2);
    p = recordResult(p, entry("cccc", "risky")).progress;
    expect(p).toMatchObject({ streak: 0, best: 2 });
    expect(p.history.map((h) => h.seed)).toEqual(["cccc", "bbbb", "aaaa"]);
  });

  it("keeps the last 20 results and survives junk", () => {
    let p = parseProgress("not json");
    expect(p).toEqual({ streak: 0, best: 0, history: [] });
    for (let i = 0; i < 25; i++) p = recordResult(p, entry(`s${1000 + i}`, "excellent")).progress;
    expect(p.history).toHaveLength(20);
    expect(parseProgress(JSON.stringify({ streak: -1, history: [{ seed: 1 }] }))).toEqual({
      streak: 0,
      best: 0,
      history: [],
    });
  });
});
