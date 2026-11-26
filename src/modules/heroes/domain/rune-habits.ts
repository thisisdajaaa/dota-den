/**
 * Your runes (pure): which runes you take and when, from the rune logs of your stored parsed
 * games. Only pickups the replay records; games stored before runes were kept are left out.
 */

/** Rune kinds as stored with match extras (declared here: heroes don't import matches). */
export type RuneKind =
  | "double_damage"
  | "haste"
  | "illusion"
  | "invisibility"
  | "regeneration"
  | "bounty"
  | "arcane"
  | "water"
  | "wisdom"
  | "shield";

export interface HeroRune {
  kind: RuneKind;
  /** Seconds from the horn. */
  time: number;
}

/** River runes that buff the hero. */
export type PowerRune = Exclude<RuneKind, "bounty" | "water" | "wisdom">;
export const POWER_RUNES: readonly PowerRune[] = [
  "double_damage",
  "haste",
  "illusion",
  "invisibility",
  "regeneration",
  "arcane",
  "shield",
];

/** Bounties taken this early are the horn bounties (the next ones spawn at 3:00). */
export const HORN_BOUNTY_UNTIL_SEC = 60;
/** Laning ends here for "power runes in the laning stage". */
export const RUNE_LANING_UNTIL_SEC = 600;
/** Shares need this many games with rune logs before they're shown. */
export const MIN_RUNE_GAMES = 5;

export interface RuneHabits {
  /** Games read with a rune log (taken any or not). */
  games: number;
  perGame: {
    bounty: number | null;
    power: number | null;
    wisdom: number | null;
    water: number | null;
  };
  /** Share of games with a bounty in the first minute; null below MIN_RUNE_GAMES. */
  hornBountyShare: number | null;
  /** Power runes per game taken before 10:00 (mid's rune control); null without games. */
  powerLaningPerGame: number | null;
  /** Power runes by kind, most taken first (kinds never taken left out). */
  powerByKind: Array<{ kind: PowerRune; n: number }>;
}

export function runeHabits(games: readonly { runes?: readonly HeroRune[] | null }[]): RuneHabits {
  const read = games.flatMap((g) => (Array.isArray(g.runes) ? [g.runes] : []));
  const n = read.length;
  const all = read.flat();
  const count = (pred: (r: HeroRune) => boolean) => all.filter(pred).length;
  const per = (x: number) => (n > 0 ? x / n : null);
  const isPower = (r: HeroRune) => (POWER_RUNES as readonly RuneKind[]).includes(r.kind);
  const horn = read.filter((rs) =>
    rs.some((r) => r.kind === "bounty" && r.time < HORN_BOUNTY_UNTIL_SEC),
  ).length;
  return {
    games: n,
    perGame: {
      bounty: per(count((r) => r.kind === "bounty")),
      power: per(count(isPower)),
      wisdom: per(count((r) => r.kind === "wisdom")),
      water: per(count((r) => r.kind === "water")),
    },
    hornBountyShare: n >= MIN_RUNE_GAMES ? horn / n : null,
    powerLaningPerGame: per(count((r) => isPower(r) && r.time < RUNE_LANING_UNTIL_SEC)),
    powerByKind: POWER_RUNES.map((kind) => ({ kind, n: count((r) => r.kind === kind) }))
      .filter((k) => k.n > 0)
      .sort((a, b) => b.n - a.n),
  };
}
