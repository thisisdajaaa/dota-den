import "server-only";
import { getDb } from "@/lib/db/mongo";
import { logger } from "@/lib/logger";
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
import type { Result } from "@/modules/shared/domain/result";
import {
  MAX_PEER_CANDIDATES,
  MAX_TRACKED_CANDIDATES,
  sortCandidates,
  type FriendCandidate,
} from "./application/contracts";
import type { ProviderError } from "./application/ports";
import {
  TogetherService,
  type PairAnalysis,
  type TogetherOverview,
} from "./application/together-service";
import { MatchDetailSeatReader } from "./infrastructure/match-seat-reader";
import { MongoTogetherRepository } from "./infrastructure/mongo-together-repository";

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
