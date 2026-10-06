import "server-only";
import type { DataOwner } from "@/common/privacy/user-data";
import { getDb } from "@/common/db/mongo";
import { logger } from "@/common/logging/logger";
import {
  getMatchQueries,
  getOpenDotaAdapter,
  getPublicRecentMatches,
} from "@/modules/matches/composition";
import { ownerOf } from "@/modules/players/application/follow-service";
import {
  getFollowService,
  getPlayerDirectory,
  getPublicProfile,
} from "@/modules/players/composition";
import { ok, type Result } from "@/common/result";
import {
  MAX_OVERVIEW_TEAMMATES,
  MAX_PEER_CANDIDATES,
  MAX_TRACKED_CANDIDATES,
  sortCandidates,
  type FriendCandidate,
  type TeammatesOverview,
  type TeammateView,
} from "./application/contracts";
import type { ProviderError } from "./application/ports";
import {
  TogetherService,
  type PairAnalysis,
  type TogetherOverview,
} from "./application/together-service";
import { MatchDetailSeatReader } from "./infrastructure/match-seat-reader";
import { MongoTogetherRepository } from "./infrastructure/mongo-together-repository";
import {
  bestTeammate,
  MIN_TEAMMATE_GAMES,
  mostPlayedWith,
  recentQueueMix,
  rivals,
  sortTeammates,
  teammateStats,
  type TeammateStat,
} from "./domain/teammates";
import * as userData from "./infrastructure/user-data";

/** Shared matches considered per friend (OpenDota's most recent, one upstream call). */
export const SHARED_MATCH_LIMIT = 100;

export async function getTogetherService(): Promise<TogetherService> {
  const db = await getDb();
  const queries = await getMatchQueries();
  return new TogetherService({
    finder: {
      sharedMatches: (me, friend) =>
        getPublicRecentMatches(me, SHARED_MATCH_LIMIT, { includedAccountId: friend }),
    },
    seats: new MatchDetailSeatReader(getOpenDotaAdapter()),
    repo: new MongoTogetherRepository(db),
    ownGames: {
      ownGames: async (me) =>
        (await queries.dashboardFacts(me, { range: "all", mode: "all" }, new Date())).facts.map(
          (f) => ({ matchId: f.matchId, startedAt: f.startedAt, result: f.result }),
        ),
    },
  });
}

export async function getPairAnalysis(
  me: number,
  friend: number,
): Promise<Result<PairAnalysis, ProviderError>> {
  const res = await (await getTogetherService()).analysePair(me, friend);
  if (!res.ok) logger.warn("together_shared_matches_failed", { reason: res.error.type });
  return res;
}

export interface TogetherCandidates {
  friends: FriendCandidate[];
  overview: TogetherOverview;
  /** Set when OpenDota's teammate list couldn't be loaded (tracked players still show). */
  peersError: ProviderError | null;
}

/**
 * Candidate friends: OpenDota teammates (top by games on the same team) plus tracked
 * players. One cached upstream call for teammates, plus one cached profile per tracked
 * player not already listed (capped).
 */
export async function getTogetherCandidates(user: {
  id: string;
  accountId32: number;
}): Promise<TogetherCandidates> {
  const me = user.accountId32;
  const [peers, follows, overview] = await Promise.all([
    getPlayerDirectory().peers(me),
    getFollowService().then((s) => s.list(ownerOf(user))),
    getTogetherService().then((s) => s.overview(me)),
  ]);
  if (!peers.ok) logger.warn("together_peers_failed", { reason: peers.error.type });

  const fromPeers: FriendCandidate[] = (peers.ok ? peers.value : [])
    .filter((p) => p.withGames > 0 && p.accountId32 !== me)
    .sort((a, b) => b.withGames - a.withGames)
    .slice(0, MAX_PEER_CANDIDATES)
    .map((p) => ({
      accountId32: p.accountId32,
      personaName: p.personaName,
      avatarUrl: p.avatarUrl,
      sameTeamGames: p.withGames,
      partyGames: overview.partyGames.get(p.accountId32) ?? 0,
      lastPlayedAt: p.lastPlayedAt,
      source: "peer" as const,
    }));

  const listed = new Set(fromPeers.map((p) => p.accountId32));
  const extra = follows
    .filter((f) => !listed.has(f.accountId32) && f.accountId32 !== me)
    .slice(0, MAX_TRACKED_CANDIDATES);
  const fromTracked = await Promise.all(
    extra.map(async (f): Promise<FriendCandidate> => {
      const profile = await getPublicProfile(f.accountId32);
      return {
        accountId32: f.accountId32,
        personaName: profile?.personaName ?? null,
        avatarUrl: profile?.avatarUrl ?? null,
        sameTeamGames: null,
        partyGames: overview.partyGames.get(f.accountId32) ?? 0,
        lastPlayedAt: null,
        source: "tracked",
      };
    }),
  );

  return {
    friends: sortCandidates([...fromPeers, ...fromTracked]),
    overview,
    peersError: peers.ok ? null : peers.error,
  };
}

/** Run `fn` over `items` with at most `limit` in flight (be gentle with the upstream). */
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

/**
 * The overview's Teammates section. Upstream: peers and win/loss (one cached call each) plus
 * one cached profile per listed teammate or rival (for the rank), capped. Our database: your
 * imported games (queue split) and confirmed parties analysed on /together.
 */
export async function getTeammatesOverview(user: {
  id: string;
  accountId32: number;
}): Promise<Result<TeammatesOverview, ProviderError>> {
  const me = user.accountId32;
  const directory = getPlayerDirectory();
  const queries = await getMatchQueries();
  const [peers, wl, own, together] = await Promise.all([
    directory.peers(me),
    directory.winLoss(me),
    queries.dashboardFacts(me, { range: "all", mode: "all" }, new Date()),
    getTogetherService().then((s) => s.overview(me)),
  ]);
  if (!peers.ok) {
    logger.warn("teammates_peers_failed", { reason: peers.error.type });
    return peers;
  }
  if (!wl.ok) logger.warn("teammates_wl_failed", { reason: wl.error.type });
  const overall = wl.ok ? { games: wl.value.wins + wl.value.losses, wins: wl.value.wins } : null;

  const records = peers.value.filter((p) => p.accountId32 !== me);
  const byId = new Map(records.map((p) => [p.accountId32, p]));
  const stats = sortTeammates(teammateStats(records, overall), "games").slice(
    0,
    MAX_OVERVIEW_TEAMMATES,
  );
  // Rivals may have no games together: same view shape, no win rate comparison.
  const rivalStats: TeammateStat[] = rivals(records).map((r) => ({
    ...r,
    winRate: r.withGames > 0 ? r.withWins / r.withGames : null,
    usualRate: null,
    delta: null,
    lowSample: r.withGames < MIN_TEAMMATE_GAMES,
  }));

  const listed = [
    ...stats,
    ...rivalStats.filter((r) => !stats.some((s) => s.accountId32 === r.accountId32)),
  ];
  const profiles = new Map(
    await mapLimit(
      listed,
      4,
      async (t) => [t.accountId32, await getPublicProfile(t.accountId32)] as const,
    ),
  );
  const view = (t: TeammateStat): TeammateView => {
    const profile = profiles.get(t.accountId32) ?? null;
    const peer = byId.get(t.accountId32);
    return {
      ...t,
      personaName: profile?.personaName ?? peer?.personaName ?? null,
      avatarUrl: profile?.avatarUrl ?? peer?.avatarUrl ?? null,
      rankTier: profile?.rankTier ?? null,
      leaderboardRank: profile?.leaderboardRank ?? null,
      confirmedParties: together.partyGames.get(t.accountId32) ?? 0,
    };
  };

  const teammates = stats.map(view);
  const find = (id: number) => teammates.find((t) => t.accountId32 === id) ?? null;
  const best = bestTeammate(stats, overall);
  const bestView = best ? find(best.teammate.accountId32) : null;
  const mostPlayed = mostPlayedWith(stats);
  return ok({
    teammates,
    best: best && bestView ? { ...best, teammate: bestView } : null,
    mostPlayed: mostPlayed ? find(mostPlayed.accountId32) : null,
    rivals: rivalStats.map(view),
    queueMix: recentQueueMix(own.facts),
    overall,
  });
}

/** Your data in this part of the app, for "Download your data". */
export async function exportMyData(owner: DataOwner) {
  return userData.exportUserData(await getDb(), owner);
}

/** Deletes (or, where shared with others, anonymises) your data here. Returns counts. */
export async function deleteMyData(owner: DataOwner) {
  return userData.deleteUserData(await getDb(), owner);
}
