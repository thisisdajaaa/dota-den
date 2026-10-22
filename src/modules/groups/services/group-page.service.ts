import { mapLimit } from "@/common/utils/map-limit";
import {
  DETAILS_PER_PAIR,
  memberPairs,
  pairKey,
  pairsToRefresh,
  type Group,
} from "../domain/group";
import { groupPartyStats } from "../domain/group-stats";
import { BOARD_DAYS, RECENT_HERO_DAYS, topHeroes, weeklyBoard } from "../domain/member-activity";
import type { GroupPartyDto, MemberHeroesDto, WeeklyBoardDto } from "../dtos/responses/groups.dto";
import type { GroupsRepositoryPort, MemberGamesSource, PartySource } from "../groups.ports";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Recent games together listed on the page. */
const RECENT_PARTIES = 10;

/**
 * The group page's numbers. Party games come from the Together feature's cache of classified
 * shared matches; each visit checks a couple of stale member pairs against OpenDota (within
 * the Together page's budget), so the page fills in over a few visits. Heroes and the weekly
 * board come from members' imported matches.
 */
export class GroupPageService {
  constructor(
    private readonly deps: {
      repository: Pick<GroupsRepositoryPort, "pairsRefreshedAt" | "markPairsRefreshed">;
      party: PartySource;
      games: MemberGamesSource;
      now?: () => Date;
    },
  ) {}

  private now() {
    return this.deps.now?.() ?? new Date();
  }

  /**
   * Check the stalest member pairs (at most MAX_PAIRS_PER_VISIT, side by side), then read the
   * cache.
   */
  async party(group: Group): Promise<GroupPartyDto> {
    const ids = group.members.map((m) => m.accountId32);
    const pairs = memberPairs(ids);
    const refreshed = await this.deps.repository.pairsRefreshedAt(group.id);
    const now = this.now();
    // The pairs are independent: check them side by side (each one is a list call, then its
    // match details a few at a time).
    const checks = await Promise.all(
      pairsToRefresh(pairs, refreshed, now).map(async (p) => ({
        p,
        res: await this.deps.party.analysePair(p[0], p[1], { maxNewDetails: DETAILS_PER_PAIR }),
      })),
    );
    let upstreamBusy = false;
    const done: string[] = [];
    for (const { p, res } of checks) {
      if (!res.ok) {
        // Busy or down: try again next visit. Anything else (e.g. no match data) is final.
        if (res.error.type === "rate_limited" || res.error.type === "unavailable")
          upstreamBusy = true;
        else done.push(pairKey(p));
        continue;
      }
      if (res.value.interrupted) upstreamBusy = true;
      // Only fresh once every shared match is classified; otherwise continue next visit.
      if (res.value.pending === 0) done.push(pairKey(p));
    }
    await this.deps.repository.markPairsRefreshed(group.id, done, now);

    const checked = new Set([...Object.keys(refreshed), ...done]);
    const stats = groupPartyStats(await this.deps.party.sameTeamAmong(ids), ids);
    const { parties, ...rest } = stats;
    return {
      stats: rest,
      recent: parties.slice(0, RECENT_PARTIES),
      pairsUnchecked: pairs.filter((p) => !checked.has(pairKey(p))).length,
      pairsTotal: pairs.length,
      upstreamBusy,
    };
  }

  /** Each member's most played heroes in the last RECENT_HERO_DAYS days. */
  async heroes(group: Group): Promise<MemberHeroesDto[]> {
    const now = this.now();
    return mapLimit(group.members, 4, async (m) => {
      const games = await this.deps.games.recentHeroes(m.accountId32, now, RECENT_HERO_DAYS);
      return { accountId32: m.accountId32, games: games.length, heroes: topHeroes(games) };
    });
  }

  /** Ranked wins and losses per member over the last BOARD_DAYS days. No MMR. */
  async weeklyBoard(group: Group): Promise<WeeklyBoardDto> {
    const to = this.now();
    const from = new Date(to.getTime() - BOARD_DAYS * DAY_MS);
    const inputs = await mapLimit(group.members, 4, async (m) => {
      const results = await this.deps.games.rankedResults(m.accountId32, from, to);
      return {
        accountId32: m.accountId32,
        wins: results.filter((r) => r === "win").length,
        losses: results.filter((r) => r === "loss").length,
      };
    });
    return { ...weeklyBoard(inputs), from, to };
  }
}
