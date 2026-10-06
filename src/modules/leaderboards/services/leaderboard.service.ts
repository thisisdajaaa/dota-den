import { periodStart, type Period } from "../domain/period";
import {
  CHALLENGE_KEYS,
  challengeStanding,
  DRAFT_KEYS,
  draftStanding,
  hasActivity,
  inScope,
  rankBy,
  ROOM_KEYS,
  roomStanding,
  topWithViewer,
  type BoardKind,
  type ChallengeStanding,
  type DraftStanding,
  type Ranked,
  type RoomStanding,
  type Scope,
} from "../domain/ranking";
import {
  BOARD_ROW_LIMIT,
  type BoardView,
  type PlayerView,
  type RowView,
  type StandingView,
} from "../dtos/responses/leaderboard-views.dto";
import type {
  AccountDirectory,
  ActivityPort,
  FriendFinder,
  PlayerAccount,
  ProfileLookup,
  RoomActivitySource,
  TotalsQuery,
} from "../leaderboards.ports";
import type { Viewer } from "../dtos/responses/leaderboards.dto";

type AnyStanding = DraftStanding | ChallengeStanding | RoomStanding;

interface Members {
  /** The viewer and their friends with accounts; null for everyone. */
  userIds: Set<string> | null;
  friendsWithAccounts: number | null;
  friendsIncomplete: boolean;
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

/** Leaderboards for draft practice, draft challenges and friend rooms. */

export class LeaderboardService {
  constructor(
    private readonly deps: {
      activity: ActivityPort;
      rooms: RoomActivitySource;
      accounts: AccountDirectory;
      profiles: ProfileLookup;
      friends: FriendFinder;
      rowLimit?: number;
    },
  ) {}

  /**
   * Everyone who chose to be listed publicly (plus the viewer, who always sees themself),
   * or the viewer plus friends who have Dota Den accounts. Profiles are private by default.
   */
  private async members(viewer: Viewer, scope: Scope): Promise<Members> {
    if (scope === "everyone") {
      const listed = await this.deps.accounts.publicUserIds();
      return {
        userIds: new Set([viewer.userId, ...listed]),
        friendsWithAccounts: null,
        friendsIncomplete: false,
      };
    }
    const found = await this.deps.friends.friendAccountIds(viewer);
    const ids = [...new Set(found.accountIds)].filter((id) => id !== viewer.accountId32);
    const accounts = ids.length ? await this.deps.accounts.byAccountIds(ids) : [];
    const friends = accounts.filter((a) => a.userId !== viewer.userId);
    return {
      userIds: new Set([viewer.userId, ...friends.map((a) => a.userId)]),
      friendsWithAccounts: friends.length,
      friendsIncomplete: found.incomplete,
    };
  }

  /** Ranked standings on one board for the members, in the period. */
  private async ranked(
    kind: BoardKind,
    members: Set<string> | null,
    since: Date | null,
  ): Promise<Ranked<AnyStanding>[]> {
    const query: TotalsQuery = { since, userIds: members ? [...members] : null };
    switch (kind) {
      case "drafts": {
        const rows = (await this.deps.activity.draftTotals(query)).map(draftStanding);
        return rankBy(inScope(rows.filter(hasActivity), members), DRAFT_KEYS);
      }
      case "challenges": {
        const rows = (await this.deps.activity.challengeTotals(query)).map(challengeStanding);
        return rankBy(inScope(rows.filter(hasActivity), members), CHALLENGE_KEYS);
      }
      case "rooms": {
        const rows = (await this.deps.rooms.totals(query)).map(roomStanding);
        return rankBy(inScope(rows.filter(hasActivity), members), ROOM_KEYS);
      }
    }
  }

  async board(input: {
    viewer: Viewer;
    kind: BoardKind;
    scope: Scope;
    period: Period;
    now: Date;
  }): Promise<BoardView> {
    const { viewer, kind, scope, period } = input;
    const since = periodStart(period, input.now);
    const members = await this.members(viewer, scope);
    const ranked = await this.ranked(kind, members.userIds, since);
    const { rows, viewerBelowCut } = topWithViewer(
      ranked,
      viewer.userId,
      this.deps.rowLimit ?? BOARD_ROW_LIMIT,
    );
    const shown = viewerBelowCut ? [...rows, viewerBelowCut] : rows;
    const players = await this.players(
      shown.map((r) => r.userId),
      viewer.userId,
    );
    const toView = (r: Ranked<AnyStanding>): RowView<AnyStanding> | null => {
      const player = players.get(r.userId);
      if (!player) return null; // the account no longer exists
      const { userId: _u, rank, ...stats } = r;
      return { rank, player, stats };
    };
    const views = rows.map(toView).filter((v) => v !== null);
    return {
      kind,
      scope,
      period,
      since,
      total: ranked.length,
      friendsWithAccounts: members.friendsWithAccounts,
      friendsIncomplete: members.friendsIncomplete,
      rows: views,
      youBelowCut: viewerBelowCut ? toView(viewerBelowCut) : null,
    } as BoardView;
  }

  /** Your rank among your friends on every board, all time (for the overview). */
  async standing(viewer: Viewer): Promise<StandingView[]> {
    const members = await this.members(viewer, "friends");
    const kinds: BoardKind[] = ["drafts", "challenges", "rooms"];
    return Promise.all(
      kinds.map(async (kind) => {
        const ranked = await this.ranked(kind, members.userIds, null);
        const you = ranked.find((r) => r.userId === viewer.userId);
        const value = !you ? 0 : "correct" in you ? you.correct : you.drafts;
        return { kind, rank: you?.rank ?? null, players: ranked.length, value };
      }),
    );
  }

  /** Name, avatar and rank for each shown player: public profile first, saved persona second. */
  private async players(userIds: string[], viewerId: string): Promise<Map<string, PlayerView>> {
    if (userIds.length === 0) return new Map();
    const accounts = await this.deps.accounts.byUserIds(userIds);
    const entries = await mapLimit(accounts, 4, async (a: PlayerAccount) => {
      const profile = await this.deps.profiles.profile(a.accountId32).catch(() => null);
      const view: PlayerView = {
        accountId32: a.accountId32,
        name: profile?.personaName ?? a.name ?? `Player ${a.accountId32}`,
        avatarUrl: profile ? profile.avatarUrl : a.avatarUrl,
        rankTier: profile?.rankTier ?? null,
        leaderboardRank: profile?.leaderboardRank ?? null,
        isYou: a.userId === viewerId,
      };
      return [a.userId, view] as const;
    });
    return new Map(entries);
  }
}
