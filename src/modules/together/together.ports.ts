import type { Result } from "@/common/result";
import type { DashboardFact } from "@/modules/matches/domain/read-models";
import type { Peer, WinLoss } from "@/modules/players/domain/public-player";
import type { PairAnalysis, TogetherOverview } from "./dtos/responses/together.dto";
import type { AccountPair, PairClassification } from "./domain/pair";
import type { Seat, Side } from "./domain/relation";
import type { OwnGame } from "./domain/together-stats";

export type ProviderError =
  | { type: "rate_limited"; retryAfterMs: number | null }
  | { type: "unavailable"; cause: string }
  | { type: "not_found" }
  | { type: "invalid_payload"; cause: string };

/**
 * A match both players appear in, from the signed-in player's side (one row of their public
 * match list). Same shape as the match list rows so the UI can reuse them.
 */
export interface SharedMatch {
  matchId: string;
  startedAt: Date;
  durationSec: number;
  heroId: number;
  side: Side;
  result: "win" | "loss";
  kills: number;
  deaths: number;
  assists: number;
  ranked: boolean;
  queueClass: "solo" | "party" | "unknown";
  partySize: number | null;
  patch: string | null;
  patchCertainty: "confident" | "boundary" | "unknown";
}

/** Upstream list of matches that include both accounts (most recent first, capped). */
export interface SharedMatchFinder {
  sharedMatches(me: number, friend: number): Promise<Result<SharedMatch[], ProviderError>>;
}

export interface MatchSeats {
  startedAt: Date;
  radiantWin: boolean;
  /** Seat per requested account; null when the account isn't in the match (or anonymous). */
  seats: Map<number, Seat | null>;
}

/** Reads seats (side, hero, party) from one match's full detail. One upstream call. */
export interface MatchSeatReader {
  seats(matchId: string, accountIds: readonly number[]): Promise<Result<MatchSeats, ProviderError>>;
}

/** Cache of classified shared matches (collection `together_matches`). */
export interface TogetherMatchesPort {
  find(pair: AccountPair, matchIds: readonly string[]): Promise<PairClassification[]>;
  /** Idempotent per (matchId, pair). */
  saveMany(rows: readonly PairClassification[]): Promise<void>;
  /** Every cached confirmed-party match involving the account (for counts and trios). */
  partyMatchesOf(accountId32: number): Promise<PairClassification[]>;
  /** Match ids where the account shared a team with a friend but party data was missing. */
  unknownPartyMatchIdsOf(accountId32: number): Promise<string[]>;
}

/** The signed-in player's own imported games, for the baseline. */
export interface OwnGamesSource {
  ownGames(accountId32: number): Promise<OwnGame[]>;
}

/** What FriendsService reads from other features (public data and your own games). */
export interface FriendsSources {
  directory: {
    peers(accountId32: number): Promise<Result<Peer[], ProviderError>>;
    winLoss(accountId32: number): Promise<Result<WinLoss, ProviderError>>;
  };
  follows: {
    list(owner: { userId: string; accountId32: number }): Promise<Array<{ accountId32: number }>>;
  };
  profiles: {
    publicProfile(accountId32: number): Promise<{
      personaName: string | null;
      avatarUrl: string | null;
      rankTier: number | null;
      leaderboardRank: number | null;
    } | null>;
  };
  /** Your imported games (all types), newest first. */
  ownFacts(accountId32: number): Promise<{ facts: DashboardFact[] }>;
  together: {
    overview(accountId32: number): Promise<TogetherOverview>;
    analysePair(me: number, friend: number): Promise<Result<PairAnalysis, ProviderError>>;
  };
}
