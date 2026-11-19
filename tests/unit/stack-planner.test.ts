import { describe, expect, it } from "vitest";
import { englishMessages, MESSAGES } from "@/common/i18n/messages";
import { translator } from "@/common/i18n/translate";
import {
  AVOID_MIN_GAMES,
  damped,
  MIN_POSITION_RECORD,
  planStack,
  PLANNER_WINDOW_DAYS,
  SHRINK_GAMES,
  type PlannerMember,
} from "@/modules/groups/domain/stack-planner";
import type { StackPlanDto } from "@/modules/groups/dtos/responses/stack-planner.dto";
import { planNotes, planText, slotEvidence } from "@/modules/groups/ui/stack-plan-text";
import type { LaneGame, Position } from "@/modules/meta/domain/position";
import type { PairClassification } from "@/modules/together/domain/pair";
import type { Relation } from "@/modules/together/domain/relation";

const NOW = new Date("2026-11-19T12:00:00Z");
const DAY = 86_400;
const nowSec = NOW.getTime() / 1000;

// Hero ids below 40 are cores, 40+ supports (the catalog's roles decide 1 vs 5 and 3 vs 4).
const rolesOf = (id: number) => (id >= 40 ? ["Support", "Disabler"] : ["Carry", "Nuker"]);
const LANE: Record<Position, { laneRole: number; heroId: number }> = {
  1: { laneRole: 1, heroId: 10 },
  2: { laneRole: 2, heroId: 20 },
  3: { laneRole: 3, heroId: 30 },
  4: { laneRole: 3, heroId: 40 },
  5: { laneRole: 1, heroId: 50 },
};

let seq = 0;
function game(
  pos: Position,
  result: "win" | "loss",
  opts: { matchId?: string; heroId?: number; daysAgo?: number } = {},
): LaneGame {
  return {
    heroId: opts.heroId ?? LANE[pos].heroId,
    laneRole: LANE[pos].laneRole,
    isRoaming: false,
    result,
    matchId: opts.matchId ?? `m${++seq}`,
    startTime: nowSec - (opts.daysAgo ?? 1) * DAY,
  };
}
/** `w` wins and `l` losses at a position. */
const record = (pos: Position, w: number, l: number, heroId?: number) => [
  ...Array.from({ length: w }, () => game(pos, "win", { heroId })),
  ...Array.from({ length: l }, () => game(pos, "loss", { heroId })),
];

/** A cached classification of a pair in one match (both on Radiant). */
function row(
  a: number,
  b: number,
  matchId: string,
  relation: Relation,
  won: boolean | null,
  daysAgo = 1,
): PairClassification {
  const party = relation === "party";
  const seat = (heroId: number) => ({
    side: "radiant" as const,
    heroId,
    partyId: party ? 7 : null,
    partySize: party ? 2 : null,
  });
  return {
    accountIdA: Math.min(a, b),
    accountIdB: Math.max(a, b),
    matchId,
    relation,
    startedAt: new Date(NOW.getTime() - daysAgo * DAY * 1000),
    radiantWin: won,
    seatA: seat(1),
    seatB: seat(2),
    fetchedAt: NOW,
  };
}

const plan = (
  members: PlannerMember[],
  partyRows: PairClassification[] = [],
  viewer: number | null = null,
) => planStack({ members, partyRows, viewer, rolesOf, now: NOW });

const posOf = (p: ReturnType<typeof plan>, id: number) =>
  p.slots.find((s) => s.accountId32 === id)!.position;

describe("stack planner: optimiser", () => {
  it("gives every member a different position, maximising the damped score", () => {
    // Both prefer Pos 1; B is better at Pos 2, so A carries and B goes mid.
    const p = plan([
      { accountId32: 1, games: record(1, 10, 2) },
      { accountId32: 2, games: [...record(1, 6, 6), ...record(2, 8, 4)] },
      { accountId32: 3, games: record(5, 7, 5) },
    ]);
    expect(posOf(p, 1)).toBe(1);
    expect(posOf(p, 2)).toBe(2);
    expect(posOf(p, 3)).toBe(5);
    expect(new Set(p.slots.map((s) => s.position)).size).toBe(3);
    expect(p.slots.map((s) => s.position)).toEqual([1, 2, 5]);
    expect(p.slots.every((s) => s.basis === "record")).toBe(true);
    expect(p.thin).toBe(false);
  });

  it("assigns a full five-stack with no duplicate positions", () => {
    const members = ([1, 2, 3, 4, 5] as Position[]).map((pos, i) => ({
      accountId32: 100 + i,
      games: [...record(pos, 6, 4), ...record(1, 5, 5)],
    }));
    const p = plan(members);
    expect(p.slots.map((s) => [s.accountId32, s.position])).toEqual([
      [100, 1],
      [101, 2],
      [102, 3],
      [103, 4],
      [104, 5],
    ]);
  });

  it("is deterministic on ties (lower account ids take the lower positions)", () => {
    const same = () => [...record(1, 5, 5), ...record(2, 5, 5)];
    const a = plan([
      { accountId32: 9, games: same() },
      { accountId32: 4, games: same() },
    ]);
    expect(posOf(a, 4)).toBe(1);
    expect(posOf(a, 9)).toBe(2);
  });

  it("needs 2 to 5 members", () => {
    expect(() => plan([{ accountId32: 1, games: [] }])).toThrow(RangeError);
    const six = Array.from({ length: 6 }, (_, i) => ({ accountId32: i + 1, games: [] }));
    expect(() => plan(six)).toThrow(RangeError);
  });
});

describe("stack planner: damping and minimum samples", () => {
  it("pulls win rates toward 50% by SHRINK_GAMES games", () => {
    expect(damped(0, 0)).toBe(0.5);
    expect(damped(3, 3)).toBeCloseTo((3 + SHRINK_GAMES / 2) / (3 + SHRINK_GAMES));
    // A 3–0 doesn't beat a solid 30–15.
    expect(damped(3, 3)).toBeLessThan(damped(30, 45));
  });

  it("ignores a win rate on fewer than MIN_POSITION_RECORD games", () => {
    // 20 games at Pos 5 at 45%, and a lucky 2–0 at Pos 1: Pos 5 it is.
    const p = plan([
      { accountId32: 1, games: [...record(5, 9, 11), ...record(1, 2, 0)] },
      { accountId32: 2, games: record(2, 6, 4) },
    ]);
    expect(MIN_POSITION_RECORD).toBe(3);
    expect(posOf(p, 1)).toBe(5);
    const slot = p.slots.find((s) => s.accountId32 === 1)!;
    expect(slot.basis).toBe("record");
    expect(slot.own).toEqual({ games: 20, decided: 20, wins: 9 });
  });

  it("flags samples under 10 decided games as small", () => {
    const p = plan([
      { accountId32: 1, games: record(1, 4, 2) },
      { accountId32: 2, games: record(2, 12, 3) },
    ]);
    expect(p.slots.find((s) => s.accountId32 === 1)!.smallSample).toBe(true);
    expect(p.slots.find((s) => s.accountId32 === 2)!.smallSample).toBe(false);
  });

  it("only counts games inside the window, and skips games without a start time", () => {
    const old = Array.from({ length: 8 }, () =>
      game(1, "win", { daysAgo: PLANNER_WINDOW_DAYS + 1 }),
    );
    const undated = { ...game(1, "win"), startTime: undefined };
    const p = plan([
      { accountId32: 1, games: [...old, undated, ...record(3, 3, 3)] },
      { accountId32: 2, games: record(2, 5, 5) },
    ]);
    const slot = p.slots.find((s) => s.accountId32 === 1)!;
    expect(slot.total).toBe(6);
    expect(slot.position).toBe(3);
  });

  it("skips games whose position can't be read (no lane data)", () => {
    const unparsed: LaneGame = { ...game(1, "win"), laneRole: null };
    const p = plan([
      { accountId32: 1, games: [unparsed, unparsed, ...record(4, 3, 3)] },
      { accountId32: 2, games: record(2, 5, 5) },
    ]);
    const slot = p.slots.find((s) => s.accountId32 === 1)!;
    expect(slot.total).toBe(8);
    expect(slot.placed).toBe(6);
  });
});

describe("stack planner: confirmed party games only", () => {
  // A (1) and B (2) played 4 games as a confirmed party: A on Pos 1, B on Pos 5.
  const together = ["p1", "p2", "p3", "p4"];
  const membersWithParty = (): PlannerMember[] => [
    {
      accountId32: 1,
      games: [
        ...together.map((m, i) => game(1, i < 3 ? "win" : "loss", { matchId: m })),
        ...record(1, 3, 3),
        ...record(2, 4, 2),
      ],
    },
    {
      accountId32: 2,
      games: [
        ...together.map((m, i) => game(5, i < 3 ? "win" : "loss", { matchId: m })),
        ...record(5, 2, 4),
        ...record(1, 4, 2),
      ],
    },
  ];

  it("counts party games with the stack and with you, by position", () => {
    const rows = together.map((m, i) => row(1, 2, m, "party", i < 3));
    const p = plan(membersWithParty(), rows, 1);
    expect(p.together).toEqual({ games: 4, decided: 4, wins: 3 });
    expect(p.exact).toEqual({ games: 4, decided: 4, wins: 3 });
    const b = p.slots.find((s) => s.accountId32 === 2)!;
    expect(b.position).toBe(5);
    expect(b.together).toEqual({ games: 4, decided: 4, wins: 3 });
    expect(b.withYou).toEqual({ games: 4, decided: 4, wins: 3 });
    // The viewer has no "with you" line of their own.
    expect(p.slots.find((s) => s.accountId32 === 1)!.withYou).toBeNull();
    expect(p.worked).toEqual([
      {
        a: { accountId32: 1, position: 1 },
        b: { accountId32: 2, position: 5 },
        decided: 4,
        wins: 3,
      },
    ]);
  });

  it("never counts sharing a team without party data as together (or solo)", () => {
    const rows = together.map((m) => row(1, 2, m, "same_team_unknown", true));
    const p = plan(membersWithParty(), rows, 1);
    expect(p.together).toEqual({ games: 0, decided: 0, wins: 0 });
    expect(p.unknownGames).toBe(4);
    expect(p.worked).toEqual([]);
    const b = p.slots.find((s) => s.accountId32 === 2)!;
    expect(b.together.games).toBe(0);
    expect(b.withYou).toEqual({ games: 0, decided: 0, wins: 0 });
  });

  it("doesn't count separate queues or opponents either", () => {
    const rows = [
      row(1, 2, "p1", "same_team_separate", true),
      row(1, 2, "p2", "opponents", true),
      row(1, 2, "p3", "undetermined", null),
    ];
    const p = plan(membersWithParty(), rows, 1);
    expect(p.together.games).toBe(0);
    expect(p.unknownGames).toBe(0);
  });

  it("leaves out party games from before the window", () => {
    const rows = together.map((m) => row(1, 2, m, "party", true, PLANNER_WINDOW_DAYS + 2));
    expect(plan(membersWithParty(), rows, 1).together.games).toBe(0);
  });

  it("counts a party game it can't place in positions, and says so", () => {
    const rows = [row(1, 2, "unparsed", "party", true)];
    const p = plan(membersWithParty(), rows, 1);
    expect(p.together.games).toBe(1);
    expect(p.togetherUnplaced).toBe(1);
  });

  it("notes a pair of positions that clearly lost together", () => {
    const lost = ["l1", "l2", "l3", "l4", "l5"];
    const rows = lost.map((m, i) => row(1, 2, m, "party", i === 0));
    const p = plan(
      [
        {
          accountId32: 1,
          games: [
            ...lost.map((m, i) => game(2, i === 0 ? "win" : "loss", { matchId: m })),
            ...record(1, 8, 2),
          ],
        },
        {
          accountId32: 2,
          games: [
            ...lost.map((m, i) => game(1, i === 0 ? "win" : "loss", { matchId: m })),
            ...record(5, 6, 4),
          ],
        },
      ],
      rows,
    );
    expect(AVOID_MIN_GAMES).toBe(4);
    expect(p.avoid).toEqual([
      {
        a: { accountId32: 1, position: 2 },
        b: { accountId32: 2, position: 1 },
        decided: 5,
        wins: 1,
      },
    ]);
    // And the lineup steers clear of it.
    expect([posOf(p, 1), posOf(p, 2)]).toEqual([1, 5]);
  });

  it("doesn't call a small losing sample an avoid", () => {
    const rows = ["x1", "x2", "x3"].map((m) => row(1, 2, m, "party", false));
    const members: PlannerMember[] = [
      {
        accountId32: 1,
        games: [
          ...["x1", "x2", "x3"].map((m) => game(1, "loss", { matchId: m })),
          ...record(1, 5, 2),
        ],
      },
      {
        accountId32: 2,
        games: [
          ...["x1", "x2", "x3"].map((m) => game(5, "loss", { matchId: m })),
          ...record(5, 5, 2),
        ],
      },
    ];
    expect(plan(members, rows).avoid).toEqual([]);
  });
});

describe("stack planner: thin data fallbacks", () => {
  it("falls back to a thin player's most played position, and flags it", () => {
    const p = plan([
      { accountId32: 1, games: record(1, 8, 4) },
      { accountId32: 2, games: [...record(4, 2, 0), game(5, "loss")] },
    ]);
    const thin = p.slots.find((s) => s.accountId32 === 2)!;
    expect(thin.position).toBe(4);
    expect(thin.basis).toBe("most_played");
    expect(thin.mostPlayed).toEqual([4, 5]);
    expect(p.thin).toBe(true);
  });

  it("players with a record pick before thin players", () => {
    const p = plan([
      { accountId32: 1, games: record(1, 1, 0) },
      { accountId32: 2, games: record(1, 7, 5) },
    ]);
    expect(posOf(p, 2)).toBe(1);
    const leftover = p.slots.find((s) => s.accountId32 === 1)!;
    expect(leftover.basis).toBe("leftover");
  });

  it("says when there's no position data at all, and when games couldn't be read", () => {
    const p = plan([
      { accountId32: 1, games: record(2, 6, 4) },
      {
        accountId32: 2,
        games: [{ heroId: 10, laneRole: null, isRoaming: null, result: "win", startTime: nowSec }],
      },
      { accountId32: 3, games: null },
    ]);
    expect(p.slots.find((s) => s.accountId32 === 2)!.basis).toBe("no_data");
    expect(p.slots.find((s) => s.accountId32 === 3)!.basis).toBe("no_data");
    expect(p.unavailable).toEqual([3]);
    expect(posOf(p, 1)).toBe(2);
  });

  it("lists hero options from the position only, most played first", () => {
    const p = plan([
      {
        accountId32: 1,
        games: [
          ...record(4, 3, 1, 41),
          ...record(4, 1, 1, 42),
          ...record(4, 2, 0, 43),
          ...record(4, 0, 1, 44),
          ...record(1, 0, 1, 11),
        ],
      },
      { accountId32: 2, games: record(1, 6, 4) },
    ]);
    const slot = p.slots.find((s) => s.accountId32 === 1)!;
    expect(slot.position).toBe(4);
    expect(slot.heroes.map((h) => [h.heroId, h.games, h.wins])).toEqual([
      [41, 4, 3],
      [43, 2, 2],
      [42, 2, 1],
    ]);
  });
});

describe("stack planner: copy", () => {
  const names = new Map([
    [1, "Kuya Jun"],
    [2, "Ana"],
  ]);
  const nameOf = (id: number) => names.get(id) ?? `Player ${id}`;
  const together = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"];
  const base = planStack({
    members: [
      {
        accountId32: 1,
        games: [
          ...together.map((m, i) => game(4, i < 6 ? "win" : "loss", { matchId: m, heroId: 41 })),
          ...record(4, 3, 2, 41),
        ],
      },
      {
        accountId32: 2,
        games: [
          ...together.map((m, i) => game(1, i < 6 ? "win" : "loss", { matchId: m })),
          ...record(1, 2, 2),
        ],
      },
    ],
    partyRows: together.map((m, i) => row(1, 2, m, "party", i < 6)),
    viewer: 2,
    rolesOf,
    now: NOW,
  });
  const dto: StackPlanDto = {
    ...base,
    heroesLocked: false,
    heroInfo: {
      41: {
        id: 41,
        name: "Lion",
        imageUrl: null,
        iconUrl: null,
        renderUrl: null,
        roles: ["Support"],
        attackType: "Ranged",
        primaryAttr: "int",
      },
    },
  };
  const jun = dto.slots.find((s) => s.accountId32 === 1)!;

  it("shows the evidence with sample sizes in English", () => {
    const t = translator(MESSAGES.en, englishMessages);
    expect(slotEvidence(t, jun, 30)).toEqual([
      "9–4 on Pos 4 in the last 30 days",
      "with this stack on Pos 4: 6–2 · together with you: 6–2",
    ]);
    const text = planText(t, dto, nameOf, "Barkada");
    expect(text).toContain("Tonight's lineup: Barkada");
    expect(text).toContain("Pos 4 (Soft support): Kuya Jun: 9–4 on Pos 4 in the last 30 days");
    expect(text).toContain("heroes: Lion 9–4");
    expect(text).toContain("Together in the last 30 days: 6–2 in confirmed party games.");
    expect(text).not.toMatch(/chance|probability|%/i);
  });

  it("speaks Filipino (Taglish) and Bisaya", () => {
    const fil = translator(MESSAGES.fil, englishMessages);
    expect(slotEvidence(fil, jun, 30)).toEqual([
      "9–4 sa Pos 4 sa huling 30 araw",
      "kasama ang stack sa Pos 4: 6–2 · kasama ka: 6–2",
    ]);
    expect(planText(fil, dto, nameOf, "Barkada")).toContain("Lineup mamaya: Barkada");
    const ceb = translator(MESSAGES.ceb, englishMessages);
    expect(slotEvidence(ceb, jun, 30)).toEqual([
      "9–4 sa Pos 4 sa miaging 30 ka adlaw",
      "uban ang stack sa Pos 4: 6–2 · kauban nimo: 6–2",
    ]);
    expect(planText(ceb, dto, nameOf, "Barkada")).toContain("Lineup karong gabii: Barkada");
  });

  it("says thin data and unknown party data out loud, in every language", () => {
    const thin: StackPlanDto = {
      ...dto,
      thin: true,
      unknownGames: 2,
      together: { games: 0, decided: 0, wins: 0 },
    };
    for (const [locale, expected] of [
      ["en", ["No confirmed party games", "no party data", "Thin data"]],
      ["fil", ["Walang kumpirmadong party game", "walang party data", "Kulang ang data"]],
      ["ceb", ["Walay kumpirmadong party game", "walay party data", "Nihit ang data"]],
    ] as const) {
      const notes = planNotes(translator(MESSAGES[locale], englishMessages), thin, nameOf).join(
        "\n",
      );
      for (const e of expected) expect(notes).toContain(e);
    }
  });
});
