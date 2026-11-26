import { describe, expect, it, vi } from "vitest";
import { err, ok } from "@/common/result";
import type { MatchDetail, MatchPlayer } from "@/modules/matches/domain/match-detail";
import {
  EXTRAS_PER_DAY,
  extrasPerDay,
  firstPurchases,
  PLUS_EXTRAS_PER_DAY,
  laneResult,
  lanePartners,
  matchExtrasFrom,
  type MatchExtras,
} from "@/modules/matches/domain/match-extras";
import type { Laning } from "@/modules/matches/domain/match-laning";
import type { MatchExtrasStore, PendingExtras } from "@/modules/matches/matches.ports";
import { MatchExtrasService } from "@/modules/matches/services/match-extras.service";

const laning = (over: Partial<Laning> = {}): Laning => ({
  lane: 1,
  laneRole: 1,
  roaming: false,
  efficiencyPct: 72,
  lastHitsAt10: 40,
  deniesAt10: 5,
  goldAt10: 4_000,
  observers: 0,
  sentries: 0,
  campsStacked: 0,
  stunsSec: 0,
  teamfight: 0.5,
  purchases: [],
  ...over,
});

const player = (playerSlot: number, over: Partial<MatchPlayer> = {}): MatchPlayer =>
  ({
    playerSlot,
    side: playerSlot < 128 ? "radiant" : "dire",
    accountId32: null,
    heroId: 100 + playerSlot,
    laning: null,
    ...over,
  }) as MatchPlayer;

const detail = (players: MatchPlayer[], parsed = true): MatchDetail =>
  ({
    matchId: "123",
    startedAt: new Date("2026-10-01T00:00:00Z"),
    parsed,
    players,
  }) as MatchDetail;

const isItem = (key: string) => !["tango", "boots"].includes(key);

describe("match extras (domain)", () => {
  it("compares your lane's gold at 10 with the lane opponents', by a 10% margin", () => {
    const you = player(0, { laning: laning({ goldAt10: 3_000 }) });
    const partner = player(1, { laning: laning({ goldAt10: 1_500 }) });
    const foe = (gold: number) => player(128, { laning: laning({ goldAt10: gold }) });
    expect(laneResult([you, partner, foe(4_000)], you)).toBe("won");
    expect(laneResult([you, partner, foe(4_400)], you)).toBe("even");
    expect(laneResult([you, partner, foe(5_000)], you)).toBe("lost");
    // No opponent in the lane, roaming, or jungle: no result, never a guess.
    expect(laneResult([you, partner], you)).toBeNull();
    const roamer = player(0, { laning: laning({ roaming: true }) });
    expect(laneResult([roamer, foe(1)], roamer)).toBeNull();
    const jungler = player(0, { laning: laning({ lane: 4 }) });
    expect(laneResult([jungler, foe(1)], jungler)).toBeNull();
  });

  it("lists the allied heroes laning with you; none for a roam or the jungle", () => {
    const you = player(0, { heroId: 1, laning: laning() });
    const partner = player(1, { heroId: 5, laning: laning() });
    const roamer = player(2, { heroId: 9, laning: laning({ roaming: true }) });
    const mid = player(3, { heroId: 7, laning: laning({ lane: 2 }) });
    const foe = player(128, { heroId: 2, laning: laning() });
    expect(lanePartners([you, partner, roamer, mid, foe], you)).toEqual([5]);
    expect(lanePartners([you, foe], you)).toEqual([]);
    expect(lanePartners([roamer, you], roamer)).toBeNull();
    const jungler = player(0, { laning: laning({ lane: 4 }) });
    expect(lanePartners([jungler, partner], jungler)).toBeNull();
  });

  it("keeps the first purchase of each completed item, in order", () => {
    expect(
      firstPurchases(
        [
          { time: 1300, key: "manta" },
          { time: -80, key: "tango" },
          { time: 900, key: "bfury" },
          { time: 1500, key: "bfury" },
          { time: 100, key: "boots" },
        ],
        isItem,
      ),
    ).toEqual([
      { key: "bfury", time: 900 },
      { key: "manta", time: 1300 },
    ]);
  });

  it("keeps your side and the wards you placed (none for an unparsed game)", () => {
    const wards = [
      { kind: "observer" as const, placedAt: -30.4, removedAt: 329.6, x: 100, y: 90 },
      { kind: "sentry" as const, placedAt: 300, removedAt: null, x: 110, y: 95 },
    ];
    const you = player(1, {
      accountId32: 42,
      heroId: 1,
      laning: laning(),
      map: { wards, teamfightDeaths: [] },
    });
    const game = { accountId32: 42, heroId: 1, side: "radiant" as const, result: "win" as const };
    expect(matchExtrasFrom(detail([you]), game, isItem)).toMatchObject({
      side: "radiant",
      wards: [
        { kind: "observer", placedAt: -30, removedAt: 330, x: 100, y: 90 },
        { kind: "sentry", placedAt: 300, removedAt: null, x: 110, y: 95 },
      ],
    });
    expect(matchExtrasFrom(detail([you], false), game, isItem)?.wards).toBeNull();
  });

  it("keeps the runes you took (null without a rune log or a parse)", () => {
    const runes = [
      { kind: "bounty" as const, time: 0 },
      { kind: "haste" as const, time: 360 },
    ];
    const game = { accountId32: 42, heroId: 1, side: "radiant" as const, result: "win" as const };
    const you = player(1, { accountId32: 42, heroId: 1, laning: laning({ runes }) });
    expect(matchExtrasFrom(detail([you]), game, isItem)?.runes).toEqual(runes);
    expect(matchExtrasFrom(detail([you], false), game, isItem)?.runes).toBeNull();
    const old = player(1, { accountId32: 42, heroId: 1, laning: laning() });
    expect(matchExtrasFrom(detail([old]), game, isItem)?.runes).toBeNull();
  });

  it("finds you by account, else by hero and side; unparsed games have no extras", () => {
    const you = player(1, {
      accountId32: 42,
      heroId: 1,
      laning: laning({ purchases: [{ time: 800, key: "bfury" }] }),
    });
    const foe = player(129, { laning: laning({ goldAt10: 2_000 }) });
    const game = { accountId32: 42, heroId: 1, side: "radiant" as const, result: "win" as const };
    expect(matchExtrasFrom(detail([you, foe]), game, isItem)).toMatchObject({
      matchId: "123",
      heroId: 1,
      parsed: true,
      laneRole: 1,
      efficiencyPct: 72,
      laneResult: "won",
      itemTimings: [{ key: "bfury", time: 800 }],
    });
    const anonymous = { ...you, accountId32: null };
    expect(matchExtrasFrom(detail([anonymous, foe]), game, isItem)?.parsed).toBe(true);
    expect(matchExtrasFrom(detail([foe]), game, isItem)).toBeNull();
    expect(matchExtrasFrom(detail([you, foe], false), game, isItem)).toMatchObject({
      parsed: false,
      laneRole: null,
      laneResult: null,
      itemTimings: [],
    });
  });
});

describe("MatchExtrasService", () => {
  const NOW = Date.parse("2026-10-16T12:00:00Z");
  const pending = (n: number): PendingExtras[] =>
    Array.from({ length: n }, (_, i) => ({
      matchId: String(1000 - i),
      heroId: 1,
      side: "radiant",
      result: "win",
      startedAt: new Date(NOW - i * 3_600_000),
    }));

  function setup(opts: { used?: number; waiting?: number; heldElsewhere?: boolean }) {
    const saved: MatchExtras[] = [];
    // The cross-server hold: taken while free (or lapsed), released by its holder.
    let heldUntil: Date | null = opts.heldElsewhere ? new Date(NOW + 60_000) : null;
    const store: MatchExtrasStore = {
      pendingParsed: vi.fn(async (_id: number, limit: number) =>
        pending(opts.waiting ?? 20).slice(0, limit),
      ),
      fetchedSince: async () => opts.used ?? 0,
      lease: vi.fn(async (_id: number, now: Date, until: Date) => {
        if (heldUntil && heldUntil > now) return false;
        heldUntil = until;
        return true;
      }),
      releaseLease: vi.fn(async (_id: number, until: Date) => {
        if (heldUntil?.getTime() === until.getTime()) heldUntil = null;
      }),
      save: async (e) => void saved.push(e),
      forHero: async () => saved.filter((e) => e.parsed),
      lanesForAccount: async () => [],
      wardsForAccount: async () => [],
      parsedGamesOnHero: async () => 3,
      exportForOwner: async () => [],
      deleteForOwner: async () => saved.length,
    };
    return { saved, store };
  }

  const parsedMatch = (matchId: string): MatchDetail => ({
    ...detail([
      player(1, {
        accountId32: 7,
        heroId: 1,
        laning: laning({ purchases: [{ time: 900, key: "bfury" }] }),
      }),
    ]),
    matchId,
  });

  it("fetches up to the daily cap, newest first, and never the stored ones", async () => {
    const { saved, store } = setup({ used: 6 });
    const fetchMatch = vi.fn(async (id: string) => ok(parsedMatch(id)));
    const svc = new MatchExtrasService({
      store,
      provider: { fetchMatch },
      completedItems: async () => isItem,
      logger: { info: () => {}, warn: () => {} },
      now: () => NOW,
    });
    const run = await svc.backfill(7);
    expect(run).toEqual({ outcome: "done", fetched: 4, parsed: 4 });
    expect(store.pendingParsed).toHaveBeenCalledWith(7, 4);
    expect(fetchMatch.mock.calls.map(([id]) => id)).toEqual(["1000", "999", "998", "997"]);
    expect(saved).toHaveLength(4);
  });

  it("reads more for Plus, and falls back to the free cap when Plus can't be checked", async () => {
    const fetchMatch = vi.fn(async (id: string) => ok(parsedMatch(id)));
    const base = {
      provider: { fetchMatch },
      completedItems: async () => isItem,
      logger: { info: () => {}, warn: () => {} },
      now: () => NOW,
    };
    expect(extrasPerDay(true)).toBe(PLUS_EXTRAS_PER_DAY);
    expect(extrasPerDay(false)).toBe(EXTRAS_PER_DAY);

    const plus = setup({ used: 10, waiting: 200 });
    const run = await new MatchExtrasService({
      ...base,
      store: plus.store,
      perDay: async () => extrasPerDay(true),
    }).backfill(7);
    expect(run).toMatchObject({ outcome: "done", fetched: PLUS_EXTRAS_PER_DAY - 10 });
    expect(plus.store.pendingParsed).toHaveBeenCalledWith(7, PLUS_EXTRAS_PER_DAY - 10);

    const unknown = setup({ used: 10 });
    expect(
      await new MatchExtrasService({
        ...base,
        store: unknown.store,
        perDay: async () => {
          throw new Error("plus down");
        },
      }).backfill(7),
    ).toMatchObject({ outcome: "capped", fetched: 0 });
  });

  it("stops at the deadline and keeps the rest for the next run", async () => {
    let now = NOW;
    const { saved, store } = setup({});
    const fetchMatch = vi.fn(async (id: string) => {
      now += 15_000;
      return ok(parsedMatch(id));
    });
    const run = await new MatchExtrasService({
      store,
      provider: { fetchMatch },
      completedItems: async () => isItem,
      logger: { info: () => {}, warn: () => {} },
      now: () => now,
    }).backfill(7, { deadline: NOW + 40_000 });
    expect(run).toEqual({ outcome: "out_of_time", fetched: 3, parsed: 3 });
    expect(saved).toHaveLength(3);
  });

  it("stops at the cap, without a catalog, or when OpenDota is busy (storing nothing)", async () => {
    const base = { logger: { info: () => {}, warn: () => {} }, now: () => NOW };
    const capped = setup({ used: 10 });
    const fetchMatch = vi.fn(async () =>
      err({ type: "rate_limited" as const, retryAfterMs: null }),
    );
    expect(
      await new MatchExtrasService({
        ...base,
        store: capped.store,
        provider: { fetchMatch },
        completedItems: async () => isItem,
      }).backfill(7),
    ).toMatchObject({ outcome: "capped", fetched: 0 });

    const noCatalog = setup({});
    expect(
      await new MatchExtrasService({
        ...base,
        store: noCatalog.store,
        provider: { fetchMatch },
        completedItems: async () => null,
      }).backfill(7),
    ).toMatchObject({ outcome: "no_catalog" });

    const busy = setup({});
    expect(
      await new MatchExtrasService({
        ...base,
        store: busy.store,
        provider: { fetchMatch },
        completedItems: async () => isItem,
      }).backfill(7),
    ).toMatchObject({ outcome: "rate_limited", fetched: 0 });
    expect(busy.saved).toEqual([]);
    expect(fetchMatch).toHaveBeenCalledTimes(1);
  });

  it("runs once per account at a time, across servers, and lets go when done", async () => {
    const base = {
      provider: { fetchMatch: vi.fn(async (id: string) => ok(parsedMatch(id))) },
      completedItems: async () => isItem,
      logger: { info: () => {}, warn: () => {} },
      now: () => NOW,
    };
    // Another server's run holds the account: this one fetches nothing (the cap stays exact).
    const elsewhere = setup({ heldElsewhere: true });
    expect(
      await new MatchExtrasService({ ...base, store: elsewhere.store }).backfill(7),
    ).toMatchObject({ outcome: "busy", fetched: 0 });
    expect(elsewhere.store.pendingParsed).not.toHaveBeenCalled();
    expect(elsewhere.store.releaseLease).not.toHaveBeenCalled();

    // Two runs at once on one server: the second is busy; the hold is released afterwards.
    const { store } = setup({ waiting: 3 });
    const svc = new MatchExtrasService({ ...base, store });
    const [first, second] = await Promise.all([svc.backfill(7), svc.backfill(7)]);
    expect(first).toMatchObject({ outcome: "done", fetched: 3 });
    expect(second).toMatchObject({ outcome: "busy", fetched: 0 });
    expect(store.lease).toHaveBeenCalledTimes(1);
    expect(store.releaseLease).toHaveBeenCalledTimes(1);
    expect(await svc.backfill(7)).toMatchObject({ outcome: "done" });
  });

  it("stores a missing match as missing, so it isn't fetched again", async () => {
    const { saved, store } = setup({ waiting: 1 });
    const svc = new MatchExtrasService({
      store,
      provider: { fetchMatch: async () => err({ type: "not_found" as const }) },
      completedItems: async () => isItem,
      logger: { info: () => {}, warn: () => {} },
      now: () => NOW,
    });
    expect(await svc.backfill(7)).toEqual({ outcome: "done", fetched: 1, parsed: 0 });
    expect(saved).toEqual([
      expect.objectContaining({ matchId: "1000", parsed: false, itemTimings: [], laneRole: null }),
    ]);
    // Analysed games never exceed the parsed games counted for the hero.
    expect((await svc.forHero(7, 1)).parsedGames).toBe(3);
  });

  it("works through accounts until the budget runs out or OpenDota is down", async () => {
    let t = NOW;
    const { store } = setup({ waiting: 2 });
    const svc = new MatchExtrasService({
      store,
      provider: {
        fetchMatch: async (id) => {
          t += 1_000;
          return id === "999" && t > NOW + 3_000
            ? err({ type: "unavailable" as const, cause: "down" })
            : ok(parsedMatch(id));
        },
      },
      completedItems: async () => isItem,
      logger: { info: () => {}, warn: () => {} },
      now: () => t,
    });
    const out = await svc.backfillMany([1, 2, 3], { budgetMs: 60_000 });
    expect(out).toEqual({ accounts: 2, fetched: 3, parsed: 3, stoppedEarly: true });
  });
});
