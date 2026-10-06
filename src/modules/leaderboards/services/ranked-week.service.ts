import { mapLimit } from "@/common/utils/map-limit";
import { MAX_RANKED_WEEK_FRIENDS, rankWeek, type RankedWeekInput } from "../domain/ranked-week";
import type { FriendFinder } from "../leaderboards.ports";
import type { RankedWeekView } from "../dtos/responses/leaderboard-views.dto";

/** Best heroes are looked up for this many rows at the top of "Ranked this week". */
const BEST_HERO_ROWS = 5;
/** At most this many OpenDota calls in flight at once. */
const CONCURRENCY = 4;

/** Ranked wins and losses this week for you and up to 15 friends (public OpenDota data). */
export class RankedWeekService {
  constructor(
    private readonly deps: {
      friends: FriendFinder;
      week: {
        recordFor(accountId32: number): Promise<RankedWeekInput | null>;
        bestHero(accountId32: number): Promise<RankedWeekInput["bestHero"]>;
      };
      profiles: {
        publicProfile(accountId32: number): Promise<{
          personaName: string | null;
          avatarUrl: string | null;
          matchHistory?: string | null;
        } | null>;
      };
    },
  ) {}

  async forViewer(viewer: { userId: string; accountId32: number }): Promise<RankedWeekView> {
    const { friends, week, profiles } = this.deps;
    const found = await friends.friendAccountIds(viewer);
    const ids = [
      viewer.accountId32,
      ...found.accountIds
        .filter((id) => id !== viewer.accountId32)
        .slice(0, MAX_RANKED_WEEK_FRIENDS),
    ];
    const inputs = await mapLimit(ids, CONCURRENCY, (id) => week.recordFor(id).catch(() => null));
    const known = inputs.filter((i): i is NonNullable<typeof i> => i !== null);
    const { rows, idle } = rankWeek(known);
    // OpenDota reports 0–0 for private match data too: only call it "didn't play" when the
    // profile says the history is fully public.
    const idleProfiles = await mapLimit(idle, CONCURRENCY, (id) =>
      profiles.publicProfile(id).catch(() => null),
    );
    const reallyIdle = idleProfiles.filter((p) => p?.matchHistory === "full").length;
    // Best heroes for the top of the board only: each is one more OpenDota call.
    const best = await mapLimit(rows.slice(0, BEST_HERO_ROWS), CONCURRENCY, (r) =>
      week.bestHero(r.accountId32).catch(() => null),
    );
    best.forEach((b, i) => (rows[i].bestHero = b));
    const named = await mapLimit(rows, CONCURRENCY, (r) =>
      profiles.publicProfile(r.accountId32).catch(() => null),
    );
    return {
      rows: rows.map((r, i) => ({
        ...r,
        name: named[i]?.personaName ?? null,
        avatarUrl: named[i]?.avatarUrl ?? null,
        you: r.accountId32 === viewer.accountId32,
      })),
      idle: reallyIdle,
      unknown: ids.length - known.length + (idle.length - reallyIdle),
      friendsIncomplete: found.incomplete,
    };
  }
}
