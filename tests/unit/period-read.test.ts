import { describe, expect, it, vi } from "vitest";
import { ungroundedIn } from "@/common/utils/grounding";
import { battleReport, periodTotals, type ReportGame } from "@/modules/report/domain/battle-report";
import { checkReadPoints, periodFacts } from "@/modules/report/domain/period-read";
import type { BattleReportView } from "@/modules/report/dtos/responses/battle-report.dto";
import type { StoredPeriodRead } from "@/modules/report/report.ports";
import { PeriodReadService } from "@/modules/report/services/period-read.service";

const game = (i: number, over: Partial<ReportGame> = {}): ReportGame => ({
  matchId: String(1000 + i),
  startedAt: new Date(Date.UTC(2026, 9, 18, i)),
  durationSec: 2400,
  heroId: i % 3 === 0 ? 74 : 1,
  side: i % 2 ? "radiant" : "dire",
  won: i % 4 !== 0,
  kills: 8,
  deaths: 4,
  assists: 10,
  goldPerMin: 600,
  xpPerMin: 650,
  lastHits: 200,
  denies: 10,
  heroDamage: 20_000,
  heroHealing: 0,
  towerDamage: 3_000,
  laneRole: 2,
  parsed: true,
  ...over,
});

const games = Array.from({ length: 12 }, (_, i) => game(i));
const view = (n = 12): BattleReportView =>
  ({
    report: battleReport(games.slice(0, n), (d) => d.toISOString().slice(0, 10)),
    from: "2026-10-18",
    to: "2026-10-24",
    mmrExact: null,
    mmrEstimate: 25,
    rankedGames: n,
    previous: { from: "2026-10-11", to: "2026-10-17", totals: periodTotals(games.slice(0, 6)) },
    current: periodTotals(games.slice(0, n)),
    source: "opendota",
  }) as unknown as BattleReportView;

const names = (id: number) => (id === 74 ? "Invoker" : "Anti-Mage");

describe("periodFacts", () => {
  it("lists the period's numbers, heroes by name, and the period before", () => {
    const v = view();
    const f = periodFacts(
      { report: v.report, current: v.current, previous: v.previous.totals, mmrExact: null },
      names,
    )!;
    const get = (k: string) => f.facts.find((x) => x.key === k)?.value;
    expect(get("games")).toBe(12);
    expect(get("wins")).toBe(9);
    expect(get("winRate")).toBe(75);
    expect(get("hero1.name")).toBe("Anti-Mage");
    expect(get("hero1.games")).toBe(8);
    expect(get("prevGames")).toBe(6);
    expect(get("avgDuration")).toBe(2400);
    // An MMR estimate is never a fact; only an exact change would be.
    expect(f.facts.some((x) => x.key === "mmrChange")).toBe(false);
  });

  it("is null with too few games", () => {
    const v = view(4);
    expect(
      periodFacts(
        { report: v.report, current: v.current, previous: v.previous.totals, mmrExact: null },
        names,
      ),
    ).toBeNull();
  });
});

describe("checkReadPoints", () => {
  const v = view();
  const { facts } = periodFacts(
    { report: v.report, current: v.current, previous: v.previous.totals, mmrExact: 42 },
    names,
  )!;
  const point = (kind: "strength" | "improve" | "focus", detail: string, keys = ["winRate"]) => ({
    kind,
    title: "A point",
    detail,
    factKeys: keys,
  });

  it("accepts grounded points with exactly one focus", () => {
    const res = checkReadPoints(
      [
        point("strength", "You won 9 of 12 games, a 75% win rate."),
        point("improve", "Your MMR moved 42 this period.", ["mmrChange"]),
        point("focus", "Keep playing Anti-Mage: 8 games so far.", ["hero1.games"]),
      ],
      facts,
    );
    expect(res.ok).toBe(true);
  });

  it("rejects invented numbers, missing citations and a missing focus", () => {
    const res = checkReadPoints(
      [
        point("strength", "You won 70% of games."),
        point("improve", "Die less.", ["nope"]),
        point("improve", "Average game was 40:00."),
      ],
      facts,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.join(" ")).toMatch(/70/);
      expect(res.error.join(" ")).toMatch(/cites no fact/);
      expect(res.error.join(" ")).toMatch(/focus/);
    }
    // The game length is backed as a clock time.
    expect(ungroundedIn("Average game was 40:00.", facts)).toEqual([]);
  });
});

describe("PeriodReadService", () => {
  const goodAnswer = {
    points: [
      {
        kind: "strength",
        title: "Strong week",
        detail: "You won 9 of 12 games.",
        facts: ["wins", "games"],
      },
      {
        kind: "improve",
        title: "Dire side",
        detail: "Look at your Dire games.",
        facts: ["direGames"],
      },
      {
        kind: "focus",
        title: "Keep it going",
        detail: "Stay on Anti-Mage.",
        facts: ["hero1.name"],
      },
    ],
  };
  function setup(over: Partial<ConstructorParameters<typeof PeriodReadService>[0]> = {}) {
    const saved = new Map<string, StoredPeriodRead>();
    const write = vi.fn(async () => ({ ok: true as const, value: goodAnswer as unknown }));
    const svc = new PeriodReadService({
      reader: { model: "m", write },
      reads: {
        get: async (k) => saved.get(k) ?? null,
        save: async (r) => void saved.set(r.key, r),
        exportForOwner: async () => [],
        deleteForOwner: async () => 0,
      },
      isPlus: async () => true,
      budget: { take: async () => true },
      heroName: async (id) => names(id),
      logger: { info: vi.fn(), warn: vi.fn() },
      ...over,
    });
    return { svc, write, saved };
  }

  it("writes a checked read once, then serves it again for free", async () => {
    const { svc, write } = setup();
    const first = await svc.write({ id: "u" }, view(), "en");
    expect(first.cached).toBe(false);
    expect(first.read.points.map((p) => p.kind)).toEqual(["strength", "improve", "focus"]);
    const again = await svc.write({ id: "u" }, view(), "en");
    expect(again.cached).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    expect(await svc.view({ id: "u" }, view(), "en")).toMatchObject({ status: "ready" });
  });

  it("retries once with the problems, then gives up", async () => {
    const bad = {
      points: [{ kind: "focus", title: "Nope", detail: "You won 99 games.", facts: ["wins"] }],
    };
    const write = vi.fn(async () => ({ ok: true as const, value: bad as unknown }));
    const { svc } = setup({ reader: { model: "m", write } });
    await expect(svc.write({ id: "u" }, view(), "en")).rejects.toMatchObject({
      details: { reason: "failed" },
    });
    expect(write).toHaveBeenCalledTimes(2);
    expect((write.mock.calls[1] as unknown[])[1]).toMatchObject({
      problems: expect.arrayContaining([expect.stringMatching(/99/)]),
    });
  });

  it("is Plus only, needs games, and respects the AI budget", async () => {
    expect(await setup({ isPlus: async () => false }).svc.view({ id: "u" }, view(), "en")).toEqual({
      status: "not_plus",
    });
    await expect(
      setup({ isPlus: async () => false }).svc.write({ id: "u" }, view(), "en"),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(await setup().svc.view({ id: "u" }, view(4), "en")).toEqual({ status: "too_few" });
    await expect(
      setup({ budget: { take: async () => false } }).svc.write({ id: "u" }, view(), "en"),
    ).rejects.toMatchObject({ details: { reason: "resting" } });
    expect(await setup({ reader: null }).svc.view({ id: "u" }, view(), "en")).toEqual({
      status: "off",
    });
  });
});
