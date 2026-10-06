import { ok, type Result } from "@/common/result";
import { otherOf, pairOf, resultFor, type PairClassification } from "../domain/pair";
import { classifyRelation, type Relation } from "../domain/relation";
import {
  baselineRecord,
  compareWithBaseline,
  heroPairs,
  summarisePair,
  topTrios,
  bestStacks,
  type BaselineComparison,
  type HeroPair,
  type PairSummary,
  type SharedGame,
  type Trio,
  type Stack,
  type WinRecord,
} from "../domain/together-stats";
import type {
  MatchSeatReader,
  OwnGamesSource,
  ProviderError,
  SharedMatch,
  SharedMatchFinder,
  TogetherRepository,
} from "./ports";

/** Match details fetched per request at most; later visits continue where this one stopped. */
export const MAX_NEW_DETAILS = 30;
/** Match details fetched in parallel (be gentle with the upstream). */
export const DETAIL_CONCURRENCY = 4;

export interface SharedMatchRow {
  match: SharedMatch;
  /** null while this match hasn't been analysed yet. */
  relation: Relation | null;
  friendHeroId: number | null;
}

export interface PairAnalysis {
  rows: SharedMatchRow[];
  summary: PairSummary;
  heroPairs: HeroPair[];
  baseline: WinRecord | null;
  comparison: BaselineComparison;
  /** Shared matches not analysed yet (a later visit continues). */
  pending: number;
  /** True when the upstream stopped us early (busy or down); pending ones retry later. */
  interrupted: boolean;
}

export interface TogetherOverview {
  /** Confirmed party games per friend, from matches analysed so far. */
  partyGames: Map<number, number>;
  trios: Trio[];
  /** Best confirmed parties by exactly who was in them. */
  stacks: Stack[];
  /** Games with a friend on your team but no party data: left out of stacks, never "together". */
  unknownPartyGames: number;
}

/** Run `fn` over `items` with at most `limit` in flight. */
async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (t: T) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export class TogetherService {
  private readonly now: () => Date;

  constructor(
    private readonly deps: {
      finder: SharedMatchFinder;
      seats: MatchSeatReader;
      repo: TogetherRepository;
      ownGames: OwnGamesSource;
      now?: () => Date;
      maxNewDetails?: number;
    },
  ) {
    this.now = deps.now ?? (() => new Date());
  }

  /**
   * Shared matches with one friend, classified by party membership. Classifications are
   * cached, so each match detail is fetched once; at most `maxNewDetails` per call.
   */
  async analysePair(me: number, friend: number): Promise<Result<PairAnalysis, ProviderError>> {
    const pair = pairOf(me, friend);
    const shared = await this.deps.finder.sharedMatches(me, friend);
    if (!shared.ok) return shared;
    const matches = shared.value;

    const cached = new Map(
      (
        await this.deps.repo.find(
          pair,
          matches.map((m) => m.matchId),
        )
      ).map((c) => [c.matchId, c]),
    );

    // Newest first, so the most relevant games are analysed on the first visit.
    const missing = matches
      .filter((m) => !cached.has(m.matchId))
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, this.deps.maxNewDetails ?? MAX_NEW_DETAILS);

    let interrupted = false;
    const fetched = await mapLimit(
      missing,
      DETAIL_CONCURRENCY,
      async (m): Promise<PairClassification | null> => {
        if (interrupted) return null;
        const res = await this.deps.seats.seats(m.matchId, [me, friend]);
        const fetchedAt = this.now();
        if (!res.ok) {
          // Busy or down: stop and retry on a later visit. Anything else won't get better,
          // so remember it as undetermined rather than refetching forever.
          if (res.error.type === "rate_limited" || res.error.type === "unavailable") {
            interrupted = true;
            return null;
          }
          return {
            ...pair,
            matchId: m.matchId,
            relation: "undetermined",
            startedAt: m.startedAt,
            radiantWin: null,
            seatA: null,
            seatB: null,
            fetchedAt,
          };
        }
        const seatA = res.value.seats.get(pair.accountIdA) ?? null;
        const seatB = res.value.seats.get(pair.accountIdB) ?? null;
        return {
          ...pair,
          matchId: m.matchId,
          relation: classifyRelation(seatA, seatB),
          startedAt: res.value.startedAt,
          radiantWin: res.value.radiantWin,
          seatA,
          seatB,
          fetchedAt,
        };
      },
    );
    const fresh = fetched.filter((c): c is PairClassification => c !== null);
    await this.deps.repo.saveMany(fresh);
    for (const c of fresh) cached.set(c.matchId, c);

    const rows: SharedMatchRow[] = matches.map((m) => {
      const c = cached.get(m.matchId);
      const friendSeat = c ? (c.accountIdA === friend ? c.seatA : c.seatB) : null;
      return { match: m, relation: c?.relation ?? null, friendHeroId: friendSeat?.heroId ?? null };
    });
    const games: SharedGame[] = rows.flatMap((r) =>
      r.relation === null
        ? []
        : [
            {
              matchId: r.match.matchId,
              startedAt: r.match.startedAt,
              relation: r.relation,
              result: r.match.result,
              myHeroId: r.match.heroId,
              friendHeroId: r.friendHeroId,
            },
          ],
    );

    const summary = summarisePair(games);
    const together = new Set(games.filter((g) => g.relation === "party").map((g) => g.matchId));
    const baseline = baselineRecord(await this.deps.ownGames.ownGames(me), summary, together);

    return ok({
      rows,
      summary,
      heroPairs: heroPairs(games),
      baseline,
      comparison: compareWithBaseline(summary.together, baseline),
      pending: rows.filter((r) => r.relation === null).length,
      interrupted,
    });
  }

  /** Party counts per friend and top trios, from cached classifications only (no upstream). */
  async overview(me: number): Promise<TogetherOverview> {
    const [party, unknownIds] = await Promise.all([
      this.deps.repo.partyMatchesOf(me),
      this.deps.repo.unknownPartyMatchIdsOf(me),
    ]);
    const partyGames = new Map<number, number>();
    for (const c of party) {
      const friend = otherOf(c, me);
      partyGames.set(friend, (partyGames.get(friend) ?? 0) + 1);
    }
    const links = party.map((c) => ({
      matchId: c.matchId,
      friendId: otherOf(c, me),
      result: resultFor(c, me),
    }));
    const trios = topTrios(links).filter((t) => t.games > 0);
    // A match confirmed as a party with another friend isn't unknown.
    const partyIds = new Set(links.map((l) => l.matchId));
    const unknownPartyGames = unknownIds.filter((id) => !partyIds.has(id)).length;
    return { partyGames, trios, stacks: bestStacks(links), unknownPartyGames };
  }
}
