import { dayKeyFormatter } from "@/common/time/day-key";
import type { Result } from "@/common/result";
import type { HeroGuide } from "@/modules/guides";
import type { WardCell } from "@/modules/guides/domain/ward-spots";
import type { HeroCoaching } from "@/modules/heroes/domain/hero-coaching";
import type { HeroRecord } from "@/modules/heroes/domain/hero-stats";
import type { OwnMatchups } from "@/modules/heroes/domain/own-matchups";
import type { CoachFactSheet } from "@/modules/matches/domain/coach-facts";
import type { DashboardFact, HeroInfo, ItemInfo } from "@/modules/matches/domain/read-models";
import {
  bracketForRankTier,
  bracketLabel,
  DEFAULT_BRACKET,
  type MetaBracket,
} from "@/modules/meta/domain/rank-bracket";
import type { RankedHero } from "@/modules/meta/domain/meta-stats";
import { POSITIONS, type Position } from "@/modules/meta/domain/position";
import type { Patch } from "@/modules/patches/domain/patch";
import type { PlaySession } from "@/modules/sessions/domain/session";
import type { SessionMmr } from "@/modules/sessions/domain/session-mmr";
import type { StopLossSettings, StopLossStatus } from "@/modules/sessions/domain/stop-loss";
import type { TiltStats } from "@/modules/sessions/domain/tilt";
import { ASK_TIME_ZONE } from "../domain/ask-quota";
import {
  countersResult,
  errorResult,
  heroGuideResult,
  heroStatsResult,
  matchSummaryResult,
  metaAllRolesResult,
  metaResult,
  mmrResult,
  patchNotesResult,
  recentGamesResult,
  sessionsResult,
  wardSpotsResult,
  type ToolResult,
} from "../domain/ask-results";
import { findHero } from "../domain/hero-lookup";
import type { AskDataPort, AskOwner } from "../assistant.ports";
import type { AskToolArgs } from "../schemas/ask-tools.schema";

/** What the tools read, as closures over other features' services (wired in the container). */
export interface AskSources {
  heroes(): Promise<readonly HeroInfo[]>;
  items(): Promise<ReadonlyMap<number, ItemInfo>>;
  /** The account's imported games (on one hero, or all), newest first. */
  games(accountId32: number, heroId?: number): Promise<DashboardFact[]>;
  heroRecord(accountId32: number, heroId: number): Promise<HeroRecord>;
  heroCoaching(accountId32: number, heroId: number): Promise<HeroCoaching | null>;
  ownMatchups(accountId32: number, heroId?: number): Promise<OwnMatchups>;
  factSheet(
    accountId32: number,
    matchId: string,
  ): Promise<Result<CoachFactSheet, { type: string }>>;
  latestSession(owner: AskOwner): Promise<{ session: PlaySession; mmr: SessionMmr } | null>;
  stopLoss(
    owner: AskOwner,
    session: PlaySession,
  ): Promise<{ settings: StopLossSettings; status: StopLossStatus | null; current: boolean }>;
  tilt(owner: AskOwner): Promise<{ stats: TiltStats; streak: number; warning: unknown }>;
  mmrEntries(owner: AskOwner): Promise<ReadonlyArray<{ observedAt: Date; mmr: number }>>;
  rankTier(accountId32: number): Promise<number | null>;
  guide(heroId: number, position?: number): Promise<HeroGuide>;
  wardCells(): Promise<{ cells: WardCell[]; games: number } | null>;
  topHeroes(
    position: Position,
    bracket: MetaBracket,
  ): Promise<Result<{ heroes: RankedHero[] }, unknown>>;
  /** A stored patch by version, or the latest when none is given; null when unknown. */
  patch(version?: string): Promise<Patch | null>;
  now?: () => Date;
}

const manilaDay = dayKeyFormatter(ASK_TIME_ZONE);

/**
 * Ask Den's tools on our own services. Each method is a thin adapter: resolve names, call the
 * feature that owns the data, shape the result (domain/ask-results.ts). Personal data is always
 * read for `owner`, which the server sets from the session.
 */
export class AppAskData implements AskDataPort {
  constructor(private readonly src: AskSources) {}

  private now() {
    return this.src.now?.() ?? new Date();
  }

  private async names() {
    const heroes = await this.src.heroes();
    const byId = new Map(heroes.map((h) => [h.id, h.name]));
    return { heroes, heroName: (id: number) => byId.get(id) ?? `Hero #${id}` };
  }

  private async hero(text: string) {
    const { heroes, heroName } = await this.names();
    return { hero: findHero(text, heroes), heroName };
  }

  private unknownHero(text: string): ToolResult {
    return errorResult(
      "unknown_hero",
      `No hero called "${text.slice(0, 40)}". Ask the player which hero they mean.`,
    );
  }

  async recentGames(owner: AskOwner, args: AskToolArgs<"my_recent_games">): Promise<ToolResult> {
    const { heroes, heroName } = await this.names();
    let heroId: number | undefined;
    if (args.hero) {
      const h = findHero(args.hero, heroes);
      if (!h) return this.unknownHero(args.hero);
      heroId = h.id;
    }
    const all = await this.src.games(owner.accountId32, heroId);
    // With a hero filter, an empty list means "no games on it", not "nothing imported".
    const total = heroId === undefined ? all.length : Math.max(1, all.length);
    const games = all
      .filter(
        (g) => (heroId === undefined || g.heroId === heroId) && (!args.ranked_only || g.ranked),
      )
      .slice(0, args.count ?? 20);
    return recentGamesResult({
      games,
      heroName,
      now: this.now(),
      dayKey: manilaDay,
      totalImported: total,
    });
  }

  async heroStats(owner: AskOwner, args: AskToolArgs<"my_hero_stats">): Promise<ToolResult> {
    const { hero, heroName } = await this.hero(args.hero);
    if (!hero) return this.unknownHero(args.hero);
    const [record, coaching, matchups, items] = await Promise.all([
      this.src.heroRecord(owner.accountId32, hero.id),
      this.src.heroCoaching(owner.accountId32, hero.id).catch(() => null),
      this.src.ownMatchups(owner.accountId32, hero.id).catch(() => null),
      this.src.items(),
    ]);
    const byKey = new Map([...items.values()].map((i) => [i.key, i.name]));
    return heroStatsResult({
      hero: hero.name,
      record,
      coaching,
      matchups,
      heroName,
      itemName: (key) => byKey.get(key) ?? key,
    });
  }

  async matchSummary(owner: AskOwner, args: AskToolArgs<"match_summary">): Promise<ToolResult> {
    const matchId = args.match_id ?? (await this.src.games(owner.accountId32))[0]?.matchId;
    if (!matchId) return errorResult("no_games_imported");
    const res = await this.src.factSheet(owner.accountId32, matchId);
    if (!res.ok) {
      if (res.error.type === "not_yours")
        return errorResult("not_your_match", "Only the player's own matches can be read.");
      if (res.error.type === "not_found") return errorResult("match_not_found");
      return errorResult("unavailable", "OpenDota didn't answer; try again in a minute.");
    }
    return matchSummaryResult(res.value);
  }

  async sessions(owner: AskOwner): Promise<ToolResult> {
    const [latest, tilt, { heroName }] = await Promise.all([
      this.src.latestSession(owner),
      this.src.tilt(owner),
      this.names(),
    ]);
    const stopLoss = latest
      ? await this.src.stopLoss(owner, latest.session).catch(() => null)
      : null;
    return sessionsResult({
      latest,
      current: stopLoss?.current ?? false,
      tilt,
      stopLoss,
      heroName,
      now: this.now(),
      dayKey: manilaDay,
    });
  }

  async mmr(owner: AskOwner): Promise<ToolResult> {
    const [entries, rankTier] = await Promise.all([
      this.src.mmrEntries(owner),
      this.src.rankTier(owner.accountId32).catch(() => null),
    ]);
    return mmrResult({ entries, rankTier, now: this.now(), dayKey: manilaDay });
  }

  async heroGuide(args: AskToolArgs<"hero_guide">): Promise<ToolResult> {
    const { hero } = await this.hero(args.hero);
    if (!hero) return this.unknownHero(args.hero);
    const [guide, items] = await Promise.all([
      this.src.guide(hero.id, args.position),
      this.src.items(),
    ]);
    return heroGuideResult({
      hero: hero.name,
      heroId: hero.id,
      guide,
      itemName: (id) => items.get(id)?.name ?? `Item #${id}`,
    });
  }

  async wardSpots(args: AskToolArgs<"ward_spots">): Promise<ToolResult> {
    return wardSpotsResult({
      data: await this.src.wardCells(),
      side: args.side,
      phase: args.phase,
      kind: args.kind ?? "observer",
    });
  }

  async heroCounters(owner: AskOwner, args: AskToolArgs<"hero_counters">): Promise<ToolResult> {
    const { hero, heroName } = await this.hero(args.hero);
    if (!hero) return this.unknownHero(args.hero);
    const [guide, own] = await Promise.all([
      this.src.guide(hero.id).catch(() => null),
      this.src.ownMatchups(owner.accountId32).catch(() => null),
    ]);
    return countersResult({
      hero: hero.name,
      heroId: hero.id,
      counters: guide?.counters ?? null,
      own,
      heroName,
    });
  }

  async metaHeroes(owner: AskOwner, args: AskToolArgs<"meta_heroes">): Promise<ToolResult> {
    const asked = args.bracket ?? "mine";
    const yours =
      asked === "mine"
        ? bracketForRankTier(await this.src.rankTier(owner.accountId32).catch(() => null))
        : null;
    const bracket: MetaBracket = asked === "mine" ? (yours ?? DEFAULT_BRACKET) : asked;
    const label = bracketLabel(bracket);
    const bracketIsYours = yours !== null && yours === bracket;
    if (args.position === undefined) {
      const [all, { heroName }] = await Promise.all([
        Promise.all(POSITIONS.map((p) => this.src.topHeroes(p, bracket).catch(() => null))),
        this.names(),
      ]);
      if (all.every((r) => !r?.ok))
        return errorResult("unavailable", "The meta couldn't be loaded right now.");
      return metaAllRolesResult({
        bracketLabel: label,
        bracketIsYours,
        roles: POSITIONS.map((position, i) => {
          const r = all[i];
          return { position, heroes: r?.ok ? r.value.heroes : [] };
        }),
        heroName,
      });
    }
    const [res, { heroName }] = await Promise.all([
      this.src.topHeroes(args.position as Position, bracket),
      this.names(),
    ]);
    if (!res.ok) return errorResult("unavailable", "The meta couldn't be loaded right now.");
    return metaResult({
      position: args.position as Position,
      bracketLabel: label,
      bracketIsYours,
      heroes: res.value.heroes,
      heroName,
    });
  }

  async patchNotes(args: AskToolArgs<"patch_notes">): Promise<ToolResult> {
    const [patch, { heroes, heroName }] = await Promise.all([
      this.src.patch(args.version),
      this.names(),
    ]);
    let hero: { id: number; name: string } | undefined;
    if (args.hero) {
      const h = findHero(args.hero, heroes);
      if (!h) return this.unknownHero(args.hero);
      hero = { id: h.id, name: h.name };
    }
    let item: { id: number; name: string } | undefined;
    if (args.item) {
      const found = findItem(args.item, [...(await this.src.items()).values()]);
      if (!found)
        return errorResult(
          "unknown_item",
          `No item called "${args.item.slice(0, 40)}". Ask the player which item they mean.`,
        );
      item = found;
    }
    return patchNotesResult({
      patch: patch && {
        version: patch.version,
        publishedAt: patch.publishedAt,
        heroes: patch.sections.heroes,
        items: [...patch.sections.items, ...patch.sections.neutralItems],
        general: patch.sections.general,
        counts: {
          heroesChanged: patch.sections.heroes.length,
          itemsChanged: patch.sections.items.length + patch.sections.neutralItems.length,
        },
      },
      hero,
      item,
      heroName,
      dayKey: manilaDay,
    });
  }
}

/** Common short names players use for items. */
const ITEM_ALIASES: Record<string, string> = {
  bkb: "black king bar",
  blink: "blink dagger",
  bots: "boots of travel",
  aghs: "aghanim's scepter",
  scepter: "aghanim's scepter",
  shard: "aghanim's shard",
  euls: "eul's scepter of divinity",
  mkb: "monkey king bar",
  "battle fury": "battle fury",
  bf: "battle fury",
  deso: "desolator",
  sny: "sange and yasha",
  "s&y": "sange and yasha",
  hex: "scythe of vyse",
  midas: "hand of midas",
  orchid: "orchid malevolence",
  pipe: "pipe of insight",
  glimmer: "glimmer cape",
  force: "force staff",
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9' &]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** An item by its name or a common short name (exact, then a unique prefix). */
export function findItem(
  text: string,
  items: ReadonlyArray<{ id: number; name: string; key?: string }>,
): { id: number; name: string } | null {
  const q = norm(text);
  const wanted = ITEM_ALIASES[q] ?? q;
  const exact = items.find((i) => norm(i.name) === wanted || i.key === wanted.replace(/ /g, "_"));
  if (exact) return { id: exact.id, name: exact.name };
  const starts = items.filter((i) => norm(i.name).startsWith(wanted));
  return starts.length === 1 ? { id: starts[0].id, name: starts[0].name } : null;
}
