import type { Logger } from "@/common/logging/logger";
import { ok, type Result } from "@/common/result";
import { mapLimit } from "@/common/utils/map-limit";
import { sortCandidates } from "../domain/candidates";
import {
  bestTeammate,
  MIN_TEAMMATE_GAMES,
  mostPlayedWith,
  recentQueueMix,
  rivals,
  sortTeammates,
  teammateStats,
  type TeammateStat,
} from "../domain/teammates";
import {
  MAX_OVERVIEW_TEAMMATES,
  MAX_PEER_CANDIDATES,
  MAX_TRACKED_CANDIDATES,
  type FriendCandidate,
  type TeammatesOverview,
  type TeammateView,
} from "../dtos/responses/together-views.dto";
import type { TogetherCandidates } from "../dtos/responses/together.dto";
import type { FriendsSources, ProviderError } from "../together.ports";

/** Who you play with: candidate friends for /together and the overview's Teammates section. */
export class FriendsService {
  constructor(private readonly deps: FriendsSources & { logger: Pick<Logger, "warn"> }) {}

  /**
   * Candidate friends: OpenDota teammates (top by games on the same team) plus tracked
   * players. One cached upstream call for teammates, plus one cached profile per tracked
   * player not already listed (capped).
   */
  async candidates(user: { id: string; accountId32: number }): Promise<TogetherCandidates> {
    const me = user.accountId32;
    const [peers, follows, overview] = await Promise.all([
      this.deps.directory.peers(me),
      this.deps.follows.list({ userId: user.id, accountId32: user.accountId32 }),
      this.deps.together.overview(me),
    ]);
    if (!peers.ok) this.deps.logger.warn("together_peers_failed", { reason: peers.error.type });

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
        const profile = await this.deps.profiles.publicProfile(f.accountId32);
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

  /**
   * The overview's Teammates section. Upstream: peers and win/loss (one cached call each) plus
   * one cached profile per listed teammate or rival (for the rank), capped. Our database: your
   * imported games (queue split) and confirmed parties analysed on /together.
   */
  async teammatesOverview(user: {
    id: string;
    accountId32: number;
  }): Promise<Result<TeammatesOverview, ProviderError>> {
    const me = user.accountId32;
    const directory = this.deps.directory;
    const [peers, wl, own, together] = await Promise.all([
      directory.peers(me),
      directory.winLoss(me),
      this.deps.ownFacts(me),
      this.deps.together.overview(me),
    ]);
    if (!peers.ok) {
      this.deps.logger.warn("teammates_peers_failed", { reason: peers.error.type });
      return peers;
    }
    if (!wl.ok) this.deps.logger.warn("teammates_wl_failed", { reason: wl.error.type });
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
        async (t) =>
          [t.accountId32, await this.deps.profiles.publicProfile(t.accountId32)] as const,
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

  /** Your games with one friend, classified by party (logged when OpenDota fails). */
  async pairAnalysis(me: number, friend: number) {
    const res = await this.deps.together.analysePair(me, friend);
    if (!res.ok)
      this.deps.logger.warn("together_shared_matches_failed", { reason: res.error.type });
    return res;
  }
}
