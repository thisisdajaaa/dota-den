/**
 * Battle report (pure): a player's games over a period, Dota Plus style. Only what the games
 * say: records link to the match they came from, replay-only stats carry their sample, and
 * nothing is estimated here (the MMR change is computed elsewhere, with the journal's rules).
 */

export interface ReportGame {
  matchId: string;
  startedAt: Date;
  durationSec: number;
  heroId: number;
  side: "radiant" | "dire";
  won: boolean;
  kills: number;
  deaths: number;
  assists: number;
  goldPerMin: number | null;
  xpPerMin: number | null;
  lastHits: number | null;
  denies: number | null;
  heroDamage: number | null;
  heroHealing: number | null;
  towerDamage: number | null;
  /** 1 safe, 2 mid, 3 off, 4 jungle: parsed replays only. */
  laneRole: number | null;
}

export const RECORD_STATS = [
  "heroDamage",
  "heroHealing",
  "kills",
  "goldPerMin",
  "xpPerMin",
  "deaths",
  "lastHits",
  "denies",
  "assists",
  "towerDamage",
] as const;
export type RecordStat = (typeof RECORD_STATS)[number];

export interface StatRecord {
  stat: RecordStat;
  value: number;
  matchId: string;
  heroId: number;
  won: boolean;
  at: Date;
}

export interface SideRecord {
  games: number;
  wins: number;
}

export interface HeroLine {
  heroId: number;
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
}

export interface BattleReport {
  games: number;
  wins: number;
  heroesPlayed: number;
  avgDurationSec: number | null;
  maxWinStreak: number;
  maxLossStreak: number;
  sides: Record<"radiant" | "dire", SideRecord>;
  records: StatRecord[];
  heroes: HeroLine[];
  /** By lane role, from games with replay lane data only. */
  roles: { withData: number; byRole: Array<{ role: number; games: number; wins: number }> };
  /** Games and wins per local day. */
  days: Map<string, { games: number; wins: number }>;
}

export function battleReport(
  games: readonly ReportGame[],
  dayKey: (d: Date) => string,
): BattleReport {
  const sorted = [...games].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  let maxWin = 0;
  let maxLoss = 0;
  let win = 0;
  let loss = 0;
  const sides = { radiant: { games: 0, wins: 0 }, dire: { games: 0, wins: 0 } };
  const heroes = new Map<number, HeroLine>();
  const roles = new Map<number, { games: number; wins: number }>();
  const days = new Map<string, { games: number; wins: number }>();
  const best = new Map<RecordStat, StatRecord>();

  for (const g of sorted) {
    win = g.won ? win + 1 : 0;
    loss = g.won ? 0 : loss + 1;
    maxWin = Math.max(maxWin, win);
    maxLoss = Math.max(maxLoss, loss);
    sides[g.side].games++;
    if (g.won) sides[g.side].wins++;

    const h = heroes.get(g.heroId) ?? {
      heroId: g.heroId,
      games: 0,
      wins: 0,
      kills: 0,
      deaths: 0,
      assists: 0,
    };
    h.games++;
    if (g.won) h.wins++;
    h.kills += g.kills;
    h.deaths += g.deaths;
    h.assists += g.assists;
    heroes.set(g.heroId, h);

    if (g.laneRole !== null && g.laneRole >= 1 && g.laneRole <= 4) {
      const r = roles.get(g.laneRole) ?? { games: 0, wins: 0 };
      r.games++;
      if (g.won) r.wins++;
      roles.set(g.laneRole, r);
    }

    const k = dayKey(g.startedAt);
    const d = days.get(k) ?? { games: 0, wins: 0 };
    d.games++;
    if (g.won) d.wins++;
    days.set(k, d);

    for (const stat of RECORD_STATS) {
      const v = g[stat];
      if (v === null || !Number.isFinite(v)) continue;
      const cur = best.get(stat);
      // Ties keep the earlier game.
      if (!cur || v > cur.value)
        best.set(stat, {
          stat,
          value: v,
          matchId: g.matchId,
          heroId: g.heroId,
          won: g.won,
          at: g.startedAt,
        });
    }
  }

  const wins = sorted.filter((g) => g.won).length;
  const withRole = [...roles.values()].reduce((n, r) => n + r.games, 0);
  return {
    games: sorted.length,
    wins,
    heroesPlayed: heroes.size,
    avgDurationSec: sorted.length
      ? Math.round(sorted.reduce((s, g) => s + g.durationSec, 0) / sorted.length)
      : null,
    maxWinStreak: maxWin,
    maxLossStreak: maxLoss,
    sides,
    records: RECORD_STATS.flatMap((s) => (best.has(s) ? [best.get(s)!] : [])),
    heroes: [...heroes.values()].sort(
      (a, b) => b.games - a.games || b.wins - a.wins || a.heroId - b.heroId,
    ),
    roles: {
      withData: withRole,
      byRole: [...roles.entries()]
        .map(([role, r]) => ({ role, ...r }))
        .sort((a, b) => a.role - b.role),
    },
    days,
  };
}
