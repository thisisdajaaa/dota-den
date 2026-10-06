import { describe, expect, it } from "vitest";
import { err, ok } from "@/common/result";
import type {
  MatchSeatReader,
  ProviderError,
  SharedMatch,
  TogetherRepository,
} from "@/modules/together/application/ports";
import { TogetherService } from "@/modules/together/application/together-service";
import type { AccountPair, PairClassification } from "@/modules/together/domain/pair";
import type { Seat } from "@/modules/together/domain/relation";

const ME = 100;
const FRIEND = 50; // smaller id: stored as accountIdA
const T0 = Date.parse("2026-09-01T00:00:00Z");

function shared(i: number, over: Partial<SharedMatch> = {}): SharedMatch {
  return {
    matchId: String(9000 + i),
    startedAt: new Date(T0 + i * 3_600_000),
    durationSec: 1800,
    heroId: 1,
    side: "radiant",
    result: "win",
    kills: 1,
    deaths: 1,
    assists: 1,
    ranked: true,
    queueClass: "party",
    partySize: 2,
    patch: null,
    patchCertainty: "unknown",
    ...over,
  };
}

class MemoryRepo implements TogetherRepository {
  rows = new Map<string, PairClassification>();
  async find(pair: AccountPair, ids: readonly string[]) {
    return [...this.rows.values()].filter(
      (r) =>
        r.accountIdA === pair.accountIdA &&
        r.accountIdB === pair.accountIdB &&
        ids.includes(r.matchId),
    );
  }
  async saveMany(rows: readonly PairClassification[]) {
    for (const r of rows) this.rows.set(`${r.matchId}:${r.accountIdA}:${r.accountIdB}`, r);
  }
  async unknownPartyMatchIdsOf(id: number) {
    return [
      ...new Set(
        [...this.rows.values()]
          .filter(
            (r) =>
              r.relation === "same_team_unknown" && (r.accountIdA === id || r.accountIdB === id),
          )
          .map((r) => r.matchId),
      ),
    ];
  }
  async partyMatchesOf(id: number) {
    return [...this.rows.values()].filter(
      (r) => r.relation === "party" && (r.accountIdA === id || r.accountIdB === id),
    );
  }
}

const party: Seat = { side: "radiant", heroId: 2, partyId: 7, partySize: 2 };

function seatReader(
  byMatch: (matchId: string) => { me: Seat | null; friend: Seat | null } | ProviderError,
) {
  const calls: string[] = [];
  const reader: MatchSeatReader = {
    async seats(matchId) {
      calls.push(matchId);
      const r = byMatch(matchId);
      if ("type" in r) return err(r);
      return ok({
        startedAt: new Date(T0),
        radiantWin: true,
        seats: new Map([
          [ME, r.me],
          [FRIEND, r.friend],
        ]),
      });
    },
  };
  return { reader, calls };
}

function service(opts: {
  matches: SharedMatch[];
  reader: MatchSeatReader;
  repo?: MemoryRepo;
  maxNewDetails?: number;
}) {
  const repo = opts.repo ?? new MemoryRepo();
  return {
    repo,
    svc: new TogetherService({
      finder: { sharedMatches: async () => ok(opts.matches) },
      seats: opts.reader,
      repo,
      ownGames: { ownGames: async () => [] },
      maxNewDetails: opts.maxNewDetails,
      now: () => new Date(T0),
    }),
  };
}

describe("TogetherService.analysePair", () => {
  it("classifies shared matches and counts only confirmed parties", async () => {
    const matches = [
      shared(1),
      shared(2, { result: "loss" }),
      shared(3),
      shared(4, { side: "dire", result: "loss" }),
    ];
    const { reader } = seatReader((id) => {
      if (id === "9001" || id === "9002") return { me: { ...party, heroId: 1 }, friend: party };
      if (id === "9003")
        return { me: { ...party, partyId: null }, friend: { ...party, partyId: null } };
      return { me: { ...party, side: "dire" }, friend: party };
    });
    const { svc, repo } = service({ matches, reader });
    const res = await svc.analysePair(ME, FRIEND);
    if (!res.ok) throw new Error("expected ok");
    expect(res.value.summary.together).toEqual({ games: 2, wins: 1 });
    expect(res.value.summary.byRelation).toMatchObject({
      party: 2,
      same_team_unknown: 1,
      opponents: 1,
    });
    expect(res.value.pending).toBe(0);
    expect(res.value.comparison.kind).toBe("too_few_together");
    // Stored with the pair in ascending order; the friend's hero is kept.
    const stored = [...repo.rows.values()];
    expect(stored.every((r) => r.accountIdA === FRIEND && r.accountIdB === ME)).toBe(true);
    expect(res.value.rows.find((r) => r.match.matchId === "9001")?.friendHeroId).toBe(2);
  });

  it("caches classifications and fetches at most the per-request budget, newest first", async () => {
    const matches = Array.from({ length: 7 }, (_, i) => shared(i));
    const { reader, calls } = seatReader(() => ({ me: party, friend: party }));
    const repo = new MemoryRepo();
    const run = (max: number) =>
      service({ matches, reader, repo, maxNewDetails: max }).svc.analysePair(ME, FRIEND);

    const first = await run(3);
    expect([...calls].sort()).toEqual(["9004", "9005", "9006"]);
    expect(first.ok && first.value.pending).toBe(4);

    const second = await run(3);
    expect(calls).toHaveLength(6);
    expect(second.ok && second.value.pending).toBe(1);

    await run(30);
    await run(30);
    // Everything cached: the last revisit made no match-detail calls.
    expect(calls).toHaveLength(7);
  });

  it("stops on a busy upstream without caching, but remembers permanent failures", async () => {
    const { reader } = seatReader((id) =>
      id === "9002" ? { type: "rate_limited", retryAfterMs: null } : { type: "not_found" },
    );
    const { svc, repo } = service({ matches: [shared(1), shared(2)], reader });
    const res = await svc.analysePair(ME, FRIEND);
    expect(res.ok && res.value.interrupted).toBe(true);
    const stored = [...repo.rows.values()];
    // The busy one is not cached (retried later); a missing detail is undetermined, never a party.
    expect(stored.find((r) => r.matchId === "9002")).toBeUndefined();
    for (const r of stored) expect(r.relation).toBe("undetermined");
  });

  it("an anonymous friend is undetermined, never a party", async () => {
    const { reader } = seatReader(() => ({ me: party, friend: null }));
    const res = await service({ matches: [shared(1)], reader }).svc.analysePair(ME, FRIEND);
    expect(res.ok && res.value.summary.byRelation.undetermined).toBe(1);
    expect(res.ok && res.value.summary.together.games).toBe(0);
  });

  it("passes upstream list failures through", async () => {
    const svc = new TogetherService({
      finder: { sharedMatches: async () => err({ type: "unavailable", cause: "down" }) },
      seats: seatReader(() => ({ me: party, friend: party })).reader,
      repo: new MemoryRepo(),
      ownGames: { ownGames: async () => [] },
    });
    expect(await svc.analysePair(ME, FRIEND)).toEqual({
      ok: false,
      error: { type: "unavailable", cause: "down" },
    });
  });

  it("overview counts confirmed parties per friend and finds trios", async () => {
    const repo = new MemoryRepo();
    const base = {
      relation: "party" as const,
      startedAt: new Date(T0),
      radiantWin: true,
      fetchedAt: new Date(T0),
      seatA: party,
      seatB: party,
    };
    await repo.saveMany([
      { ...base, matchId: "1", accountIdA: 50, accountIdB: ME },
      { ...base, matchId: "1", accountIdA: ME, accountIdB: 200 },
      { ...base, matchId: "2", accountIdA: 50, accountIdB: ME },
    ]);
    const reader = seatReader(() => ({ me: null, friend: null })).reader;
    const o = await service({ matches: [], reader, repo }).svc.overview(ME);
    expect(o.partyGames.get(50)).toBe(2);
    expect(o.partyGames.get(200)).toBe(1);
    expect(o.trios).toEqual([{ friends: [50, 200], games: 1, wins: 1, lastMatchId: "1" }]);
  });

  it("overview counts unknown-party games only when no party was confirmed", async () => {
    const repo = new MemoryRepo();
    const base = {
      startedAt: new Date(T0),
      radiantWin: true,
      fetchedAt: new Date(T0),
      seatA: party,
      seatB: party,
    };
    await repo.saveMany([
      { ...base, relation: "party", matchId: "1", accountIdA: 50, accountIdB: ME },
      // Unknown with one friend, but confirmed with another: not unknown.
      { ...base, relation: "same_team_unknown", matchId: "1", accountIdA: ME, accountIdB: 200 },
      { ...base, relation: "same_team_unknown", matchId: "2", accountIdA: ME, accountIdB: 200 },
      { ...base, relation: "same_team_unknown", matchId: "2", accountIdA: 50, accountIdB: ME },
    ]);
    const reader = seatReader(() => ({ me: null, friend: null })).reader;
    const o = await service({ matches: [], reader, repo }).svc.overview(ME);
    expect(o.unknownPartyGames).toBe(1);
    expect(o.stacks).toEqual([]); // one game is below the minimum
  });
});
