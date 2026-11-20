import { clock } from "@/common/utils/grounding";
import { BUILD_STEPS, type ItemPick } from "@/modules/guides/domain/hero-guide";
import type { SkillBuild } from "@/modules/guides/domain/skill-build";
import {
  topWardSpots,
  type WardCell,
  type WardKind,
  type WardPhase,
  type WardSide,
} from "@/modules/guides/domain/ward-spots";
import { factLabel, factText, type CoachFactSheet } from "@/modules/matches/domain/coach-facts";
import { summarizeMatches } from "@/modules/matches/domain/match-summary";
import { parseRankTier } from "@/modules/matches/domain/rank-tier";
import type { DashboardFact } from "@/modules/matches/domain/read-models";
import type { HeroRecord } from "@/modules/heroes/domain/hero-stats";
import type { HeroCoaching } from "@/modules/heroes/domain/hero-coaching";
import type { MatchupRecord, OwnMatchups } from "@/modules/heroes/domain/own-matchups";
import type { RankedHero } from "@/modules/meta/domain/meta-stats";
import { POSITION_INFO, type Position } from "@/modules/meta/domain/position";
import type { HeroPatchNotes, ItemPatchNotes, PatchNote } from "@/modules/patches/domain/patch";
import type { PlaySession } from "@/modules/sessions/domain/session";
import type { SessionMmr } from "@/modules/sessions/domain/session-mmr";
import { MIN_TILT_GAMES, type TiltStats, type WinRate } from "@/modules/sessions/domain/tilt";
import type { StopLossSettings, StopLossStatus } from "@/modules/sessions/domain/stop-loss";
import type { AskSource } from "./ask-sources";
import { wardArea } from "./ward-areas";

/**
 * What each Ask Den tool returns to the model (pure): small, readable JSON built from our
 * services' own data, with rates already as percentages (one decimal) and game clocks as
 * "mm:ss", so the model can quote them and the checker can match them. Nothing is estimated
 * here: a value we don't have is left out or marked, never filled in.
 */

export interface ToolResult {
  data: unknown;
  sources: AskSource[];
}

export type HeroName = (heroId: number) => string;

const pct = (rate: number | null | undefined): number | null =>
  rate === null || rate === undefined || !Number.isFinite(rate)
    ? null
    : Math.round(rate * 1000) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;
const DAY = 86_400_000;

/** "YYYY-MM-DD" and whole days ago, for dates the model may mention. */
function when(at: Date, now: Date, dayKey: (d: Date) => string) {
  return {
    date: dayKey(at),
    daysAgo: Math.max(0, Math.floor((now.getTime() - at.getTime()) / DAY)),
  };
}

export function errorResult(error: string, hint?: string): ToolResult {
  return { data: { error, ...(hint ? { hint } : {}) }, sources: [] };
}

// ---------------------------------------------------------------- my_recent_games

export function recentGamesResult(input: {
  /** Newest first, already filtered (hero, ranked) and cut to the count asked for. */
  games: readonly DashboardFact[];
  heroName: HeroName;
  now: Date;
  dayKey: (d: Date) => string;
  /** Imported games on the account in total (0: nothing synced yet). */
  totalImported: number;
}): ToolResult {
  const { games, heroName } = input;
  if (games.length === 0)
    return errorResult(
      input.totalImported === 0 ? "no_games_imported" : "no_games_match",
      input.totalImported === 0
        ? "Nothing is imported yet: the player should open the Overview to sync, and turn on Expose Public Match Data in Dota 2."
        : undefined,
    );
  const s = summarizeMatches(games, { formLength: games.length, topHeroes: 5 });
  const rec = (w: { games: number; wins: number; winRate: number | null }) => ({
    games: w.games,
    wins: w.wins,
    winRatePct: pct(w.winRate),
  });
  return {
    data: {
      games: s.overall.games,
      wins: s.overall.wins,
      losses: s.overall.losses,
      winRatePct: pct(s.overall.winRate),
      smallSample: s.overall.lowSample,
      averages: s.averages && {
        kills: r1(s.averages.kills),
        deaths: r1(s.averages.deaths),
        assists: r1(s.averages.assists),
        kda: r2(s.averages.kda),
      },
      // Missing party size is unknown, never solo.
      byParty: {
        solo: rec(s.byQueue.solo),
        party: rec(s.byQueue.party),
        unknown: rec(s.byQueue.unknown),
      },
      heroes: s.heroes.map((h) => ({ hero: heroName(h.heroId), ...rec(h), kda: r2(h.kda) })),
      list: games.slice(0, 20).map((g) => ({
        matchId: g.matchId,
        hero: heroName(g.heroId),
        result: g.result,
        kills: g.kills,
        deaths: g.deaths,
        assists: g.assists,
        length: clock(g.durationSec),
        ranked: g.ranked,
        party: g.queueClass,
        ...when(g.startedAt, input.now, input.dayKey),
      })),
    },
    sources: [{ kind: "your_games", games: games.length }],
  };
}

// ---------------------------------------------------------------- my_hero_stats

const LANE_NAMES: Record<number, string> = { 1: "safe lane", 2: "mid", 3: "off lane", 4: "jungle" };

const matchupRow = (m: MatchupRecord, heroName: HeroName) => ({
  hero: heroName(m.heroId),
  games: m.games,
  wins: m.wins,
  winRatePct: pct(m.winRate),
});

export function heroStatsResult(input: {
  hero: string;
  record: HeroRecord;
  coaching: HeroCoaching | null;
  matchups: OwnMatchups | null;
  heroName: HeroName;
  itemName: (key: string) => string;
}): ToolResult {
  const { record, coaching, matchups, heroName } = input;
  if (record.games === 0)
    return errorResult("no_games_on_hero", `No imported games on ${input.hero}.`);
  const sources: AskSource[] = [{ kind: "your_games", games: record.games }];
  let replay: unknown = { note: "Item timings and lanes are unavailable right now." };
  if (coaching) {
    if (coaching.analysed > 0)
      sources.push({ kind: "your_parsed_games", games: coaching.analysed });
    replay = coaching.enough
      ? {
          analysedGames: coaching.analysed,
          itemTimings: coaching.timings.slice(0, 6).map((t) => ({
            item: input.itemName(t.key),
            games: t.games,
            medianInWins: t.wins.median === null ? null : clock(t.wins.median),
            medianInLosses: t.losses.median === null ? null : clock(t.losses.median),
          })),
          lanes: coaching.lanes.map((l) => ({
            role: LANE_NAMES[l.laneRole] ?? "unknown",
            games: l.games,
            gameWins: l.wins,
            laneWon: l.lane.won,
            laneEven: l.lane.even,
            laneLost: l.lane.lost,
            laneEfficiencyMedianPct: l.efficiency?.median ?? null,
          })),
        }
      : {
          note: "Not enough parsed replays on this hero for item timings and lane results.",
          analysedGames: coaching.analysed,
          needed: coaching.minGames,
        };
  }
  return {
    data: {
      hero: input.hero,
      games: record.games,
      wins: record.wins,
      losses: record.losses,
      winRatePct: pct(record.winRate),
      smallSample: record.lowSample,
      kda: record.kda === null ? null : r2(record.kda),
      averages: record.averages && {
        kills: r1(record.averages.kills),
        deaths: r1(record.averages.deaths),
        assists: r1(record.averages.assists),
      },
      replays: replay,
      enemies: matchups?.baseline
        ? {
            gamesWithLineups: matchups.withLineups,
            toughest: matchups.toughest.slice(0, 5).map((m) => matchupRow(m, heroName)),
            easiest: matchups.easiest.slice(0, 5).map((m) => matchupRow(m, heroName)),
          }
        : { note: "Not enough games with known lineups on this hero." },
    },
    sources,
  };
}

// ---------------------------------------------------------------- match_summary

export function matchSummaryResult(sheet: CoachFactSheet): ToolResult {
  return {
    data: {
      matchId: sheet.matchId,
      hero: sheet.heroName,
      facts: sheet.facts.map((f) => ({ what: factLabel(f), value: factText(f) })),
      missing: sheet.missing,
    },
    sources: [{ kind: "your_match", matchId: sheet.matchId }],
  };
}

// ---------------------------------------------------------------- my_sessions

const rate = (w: WinRate) => ({
  games: w.games,
  wins: w.wins,
  winRatePct: w.games ? pct(w.rate) : null,
});

export function sessionsResult(input: {
  latest: { session: PlaySession; mmr: SessionMmr } | null;
  current: boolean;
  tilt: { stats: TiltStats; streak: number; warning: unknown };
  stopLoss: { settings: StopLossSettings; status: StopLossStatus | null } | null;
  heroName: HeroName;
  now: Date;
  dayKey: (d: Date) => string;
}): ToolResult {
  const { latest, tilt, stopLoss } = input;
  if (!latest) return errorResult("no_games_imported");
  const s = latest.session.stats;
  const mmr = latest.mmr;
  return {
    data: {
      latestSession: {
        ...when(latest.session.startedAt, input.now, input.dayKey),
        stillGoing: input.current,
        games: s.games,
        wins: s.wins,
        losses: s.losses,
        ranked: s.ranked,
        longestWinStreak: s.longestWinStreak,
        longestLossStreak: s.longestLossStreak,
        heroes: s.heroes
          .slice(0, 4)
          .map((h) => ({ hero: input.heroName(h.heroId), games: h.games, wins: h.wins })),
        // Only an exact change from the player's own MMR entries; estimates are left out.
        mmrChange:
          mmr.kind === "exact" ? mmr.delta : "not known (no MMR entries around this session)",
      },
      lossStreakNow: tilt.streak,
      tilt: {
        usual: rate(tilt.stats.baseline),
        afterTwoLossesInARow: rate(tilt.stats.afterLosses[2]),
        afterThreeLossesInARow: rate(tilt.stats.afterLosses[3]),
        enoughData: tilt.stats.afterLosses[2].games >= MIN_TILT_GAMES,
        warningNow: tilt.warning !== null,
      },
      stopLoss:
        stopLoss && stopLoss.status && stopLoss.settings.enabled
          ? {
              on: true,
              appliesToLatestSession: input.current,
              rules: stopLoss.status.rules.map((r) => ({
                rule: r.rule,
                limit: r.limit,
                used: r.used,
                reached: r.reached,
              })),
            }
          : { on: false, hint: "The player can set stop-loss limits on the Account page." },
    },
    sources: [{ kind: "your_sessions" }],
  };
}

// ---------------------------------------------------------------- my_mmr

export function mmrResult(input: {
  entries: ReadonlyArray<{ observedAt: Date; mmr: number }>;
  rankTier: number | null;
  now: Date;
  dayKey: (d: Date) => string;
}): ToolResult {
  const sorted = [...input.entries].sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime());
  const tier = parseRankTier(input.rankTier);
  const medal = tier
    ? tier.medal === "Immortal"
      ? "Immortal"
      : `${tier.medal} ${tier.stars}`
    : null;
  const month = sorted.filter((e) => input.now.getTime() - e.observedAt.getTime() <= 30 * DAY);
  return {
    data: {
      rankMedal: medal ?? "unknown",
      entriesLogged: sorted.length,
      ...(sorted.length === 0
        ? {
            note: "The player hasn't logged any MMR. Their MMR is unknown; they can log it in the MMR journal.",
          }
        : {
            latest: { mmr: sorted[0].mmr, ...when(sorted[0].observedAt, input.now, input.dayKey) },
            recent: sorted
              .slice(0, 10)
              .map((e) => ({ mmr: e.mmr, ...when(e.observedAt, input.now, input.dayKey) })),
            changeLast30Days: month.length >= 2 ? month[0].mmr - month[month.length - 1].mmr : null,
          }),
    },
    sources: [{ kind: "your_mmr", entries: sorted.length }],
  };
}

// ---------------------------------------------------------------- hero_guide

const STEP_NAMES: Record<(typeof BUILD_STEPS)[number], string> = {
  start: "starting",
  startAlt: "other starting choices",
  early: "early",
  core: "core",
  late: "late",
  situational: "situational",
};

function itemRows(picks: readonly ItemPick[], itemName: (id: number) => string) {
  return picks.slice(0, 6).map((p) => ({
    item: itemName(p.itemId),
    ...(p.share === undefined ? {} : { boughtInPct: pct(p.share) }),
    ...(p.minute === undefined ? {} : { typicalMinute: p.minute }),
    ...(p.winRate === undefined ? {} : { winRatePct: pct(p.winRate) }),
  }));
}

export interface GuideInput {
  items: Record<"start" | "early" | "mid" | "late", ItemPick[]> | null;
  build: Record<(typeof BUILD_STEPS)[number], ItemPick[]> | null;
  skills: SkillBuild | null;
  itemSource:
    | { source: "pubs"; position: number; positions: { position: number; share: number }[] }
    | { source: "pro" };
}

export function heroGuideResult(input: {
  hero: string;
  heroId: number;
  guide: GuideInput;
  itemName: (id: number) => string;
}): ToolResult {
  const { guide, itemName } = input;
  const pubs = guide.itemSource.source === "pubs";
  const build = guide.build
    ? Object.fromEntries(
        BUILD_STEPS.map((s) => [STEP_NAMES[s], itemRows(guide.build![s], itemName)]),
      )
    : guide.items
      ? Object.fromEntries(
          (["start", "early", "mid", "late"] as const).map((p) => [
            p,
            itemRows(guide.items![p], itemName),
          ]),
        )
      : null;
  const skills = guide.skills;
  const abilityName = (id: number) => skills?.abilities.find((a) => a.id === id)?.name ?? "talent";
  if (!build && !skills)
    return errorResult("no_guide_data", `No build data for ${input.hero} right now.`);
  const sources: AskSource[] = [];
  if (build) sources.push(pubs ? { kind: "high_rank_pubs" } : { kind: "pro_games", games: null });
  if (skills) sources.push({ kind: "pro_games", games: skills.games });
  return {
    data: {
      hero: input.hero,
      itemsFrom: pubs
        ? "Legend–Immortal pub games from the last week (STRATZ)"
        : "recent pro games (OpenDota)",
      ...(guide.itemSource.source === "pubs"
        ? {
            position: guide.itemSource.position,
            positionsPlayed: guide.itemSource.positions.map((p) => ({
              position: p.position,
              sharePct: pct(p.share),
            })),
          }
        : {}),
      items: build,
      skills: skills
        ? {
            fromProGames: skills.games,
            orderFromLevel1: skills.order.slice(0, 16).map(abilityName),
            talents: skills.talents.map((t) => {
              const top = [...t.options].sort((a, b) => b.picks - a.picks)[0];
              return {
                level: t.level,
                mostPicked: top?.name ?? null,
                pickedPct: top ? pct(top.share) : null,
              };
            }),
          }
        : null,
      guidePage: `/guides/${input.heroId}`,
    },
    sources,
  };
}

// ---------------------------------------------------------------- ward_spots

export function wardSpotsResult(input: {
  data: { cells: WardCell[]; games: number } | null;
  side: WardSide;
  phase: WardPhase;
  kind: WardKind;
}): ToolResult {
  if (!input.data || input.data.cells.length === 0) return errorResult("no_ward_data");
  const spots = topWardSpots(
    input.data.cells,
    { kind: input.kind, side: input.side, phase: input.phase },
    6,
  );
  if (spots.length === 0) return errorResult("no_ward_data");
  return {
    data: {
      side: input.side,
      phase: input.phase,
      kind: input.kind,
      fromProGames: input.data.games,
      mapNote:
        "Radiant's base is bottom left, Dire's top right; the river runs from the top-left corner to the bottom-right one. 'half' is which side of the river the spot is on.",
      spots: spots.map((s, i) => ({ rank: i + 1, ...wardArea(s), placements: s.count })),
      wardMapPage: `/guides/wards?ws=${input.side}&wp=${input.phase}&wk=${input.kind}`,
    },
    sources: [{ kind: "pro_games", games: input.data.games }],
  };
}

// ---------------------------------------------------------------- hero_counters

export function countersResult(input: {
  hero: string;
  heroId: number;
  counters: {
    strongAgainst: ReadonlyArray<{ heroId: number; games: number; rate: number }>;
    weakAgainst: ReadonlyArray<{ heroId: number; games: number; rate: number }>;
    source: "pubs" | "pro";
  } | null;
  own: OwnMatchups | null;
  heroName: HeroName;
}): ToolResult {
  const { counters, own, heroName } = input;
  const row = (c: { heroId: number; games: number; rate: number }) => ({
    hero: heroName(c.heroId),
    games: c.games,
    heroWinRatePct: pct(c.rate),
  });
  const mine = own && [...own.toughest, ...own.easiest].find((m) => m.heroId === input.heroId);
  if (!counters && !mine) return errorResult("no_matchup_data");
  const sources: AskSource[] = [];
  if (counters)
    sources.push(
      counters.source === "pubs" ? { kind: "high_rank_pubs" } : { kind: "pro_games", games: null },
    );
  if (mine) sources.push({ kind: "your_games", games: mine.games });
  return {
    data: {
      hero: input.hero,
      ...(counters
        ? {
            from:
              counters.source === "pubs" ? "Legend–Immortal pubs (STRATZ)" : "pro games (OpenDota)",
            heroIsStrongAgainst: counters.strongAgainst.slice(0, 6).map(row),
            heroIsWeakAgainst: counters.weakAgainst.slice(0, 6).map(row),
          }
        : { note: "No public matchup data right now." }),
      yourGamesAgainstThisHero: mine
        ? { games: mine.games, wins: mine.wins, winRatePct: pct(mine.winRate) }
        : "not enough of your games against this hero",
    },
    sources,
  };
}

// ---------------------------------------------------------------- meta_heroes

export function metaResult(input: {
  position: Position;
  bracketLabel: string;
  bracketIsYours: boolean;
  heroes: readonly RankedHero[];
  heroName: HeroName;
}): ToolResult {
  if (input.heroes.length === 0) return errorResult("no_meta_data");
  return {
    data: {
      position: input.position,
      role: POSITION_INFO[input.position].name,
      bracket: input.bracketLabel,
      bracketIsThePlayersOwn: input.bracketIsYours,
      heroes: input.heroes.slice(0, 8).map((h, i) => {
        const w = h.bracket ?? h.atPosition ?? h.highRank;
        return {
          rank: i + 1,
          hero: input.heroName(h.heroId),
          ...(w ? { games: w.games, winRatePct: pct(w.rate) } : {}),
          ...(h.bracket?.pickRate != null ? { pickRatePct: pct(h.bracket.pickRate) } : {}),
        };
      }),
    },
    sources: [{ kind: "bracket_pubs", bracket: input.bracketLabel }],
  };
}

/** The strongest heroes in every role (a "who's strong right now" question with no role). */
export function metaAllRolesResult(input: {
  bracketLabel: string;
  bracketIsYours: boolean;
  roles: ReadonlyArray<{ position: Position; heroes: readonly RankedHero[] }>;
  heroName: HeroName;
  perRole?: number;
}): ToolResult {
  const roles = input.roles.filter((r) => r.heroes.length > 0);
  if (roles.length === 0) return errorResult("no_meta_data");
  return {
    data: {
      bracket: input.bracketLabel,
      bracketIsThePlayersOwn: input.bracketIsYours,
      roles: roles.map((r) => ({
        position: r.position,
        role: POSITION_INFO[r.position].name,
        heroes: r.heroes.slice(0, input.perRole ?? 4).map((h, i) => {
          const w = h.bracket ?? h.atPosition ?? h.highRank;
          return {
            rank: i + 1,
            hero: input.heroName(h.heroId),
            ...(w ? { games: w.games, winRatePct: pct(w.rate) } : {}),
            ...(h.bracket?.pickRate != null ? { pickRatePct: pct(h.bracket.pickRate) } : {}),
          };
        }),
      })),
    },
    sources: [{ kind: "bracket_pubs", bracket: input.bracketLabel }],
  };
}

// ---------------------------------------------------------------- patch_notes

/** Patch note lines kept per answer (long patches are cut, and say so). */
export const PATCH_NOTE_LINES = 40;

const noteLines = (notes: readonly PatchNote[]) =>
  notes.filter((n) => n.text.trim()).map((n) => (n.subtitle ? `${n.text}:` : n.text));

/** What a patch changed: for one hero, one item, or an overview. Valve's own words. */
export function patchNotesResult(input: {
  patch: {
    version: string;
    publishedAt: Date;
    heroes: readonly HeroPatchNotes[];
    items: readonly ItemPatchNotes[];
    general: ReadonlyArray<{ title: string | null; notes: readonly PatchNote[] }>;
    counts: { heroesChanged: number; itemsChanged: number };
  } | null;
  hero?: { id: number; name: string };
  item?: { id: number; name: string };
  heroName: HeroName;
  dayKey: (d: Date) => string;
}): ToolResult {
  const { patch } = input;
  if (!patch) return errorResult("patch_not_found", "Only stored patches can be read.");
  const head = { patch: patch.version, released: input.dayKey(patch.publishedAt) };
  const sources: AskSource[] = [{ kind: "patch_notes", version: patch.version }];
  const capped = (lines: string[]) => ({
    changes: lines.slice(0, PATCH_NOTE_LINES),
    ...(lines.length > PATCH_NOTE_LINES ? { moreChangesNotShown: true } : {}),
  });
  if (input.hero) {
    const h = patch.heroes.find((x) => x.heroId === input.hero!.id);
    if (!h) return { data: { ...head, hero: input.hero.name, changed: false }, sources };
    const lines = [
      ...noteLines(h.heroNotes),
      ...h.abilities.flatMap((a) =>
        noteLines(a.notes).map((t) => `${a.abilityName ?? "Ability"}: ${t}`),
      ),
      ...noteLines(h.talentNotes).map((t) => `Talent: ${t}`),
    ];
    return { data: { ...head, hero: input.hero.name, changed: true, ...capped(lines) }, sources };
  }
  if (input.item) {
    const it = patch.items.find((x) => x.itemId === input.item!.id);
    if (!it) return { data: { ...head, item: input.item.name, changed: false }, sources };
    return {
      data: { ...head, item: input.item.name, changed: true, ...capped(noteLines(it.notes)) },
      sources,
    };
  }
  return {
    data: {
      ...head,
      heroesChanged: patch.counts.heroesChanged,
      itemsChanged: patch.counts.itemsChanged,
      heroesWithChanges: patch.heroes.slice(0, 60).map((h) => input.heroName(h.heroId)),
      ...capped(
        patch.general.flatMap((g) => [...(g.title ? [`${g.title}:`] : []), ...noteLines(g.notes)]),
      ),
    },
    sources,
  };
}
