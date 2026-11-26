/**
 * Your wards (pure): where and when you ward, and how long your observers last, from the ward
 * logs of your stored parsed games. Only what the replays say: a ward with no removal time is
 * left out of lifetimes, never guessed.
 */
import type { HeroRune } from "./rune-habits";

/** One ward you placed (seconds from the horn; game map cells). */
export interface ExtrasWard {
  kind: "observer" | "sentry";
  placedAt: number;
  removedAt: number | null;
  x: number;
  y: number;
}

/** Parsed games read for the page (the newest; older ones add little to "your habits"). */
export const WARD_GAMES_LIMIT = 50;
/** Observer wards last this long unless destroyed (seconds). */
export const OBSERVER_LIFE_SEC = 360;
/** Sentry wards last this long unless destroyed (seconds). */
export const SENTRY_LIFE_SEC = 420;
/** Removed this much before its full life: destroyed (by an enemy, usually), not expired. */
const EARLY_MARGIN_SEC = 15;
/** Lifetimes and shares need this many timed observers before they're shown. */
export const MIN_TIMED_OBSERVERS = 10;

export interface WardGame {
  matchId: string;
  heroId: number;
  side: "radiant" | "dire" | null;
  wards: readonly ExtrasWard[];
  /** Runes picked up; null or missing on games stored before runes were kept. */
  runes?: readonly HeroRune[] | null;
}

export interface WardHabits {
  /** Parsed games read (with ward logs, warded or not). */
  games: number;
  /** Of those, games where you placed at least one ward. */
  gamesWarded: number;
  observers: {
    placed: number;
    perGame: number | null;
    /** Observers whose removal the replay records (lifetimes come from these). */
    timed: number;
    /** Average seconds up, of timed observers; null below MIN_TIMED_OBSERVERS. */
    avgLifeSec: number | null;
    /** Share of timed observers destroyed before expiring; null below MIN_TIMED_OBSERVERS. */
    destroyedShare: number | null;
  };
  sentries: { placed: number; perGame: number | null };
  /** Median time of your first observer, in games where you placed one. */
  firstObserverSec: number | null;
}

const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2);
};

export function wardHabits(games: readonly WardGame[]): WardHabits {
  const all = games.flatMap((g) => g.wards);
  const observers = all.filter((w) => w.kind === "observer");
  const sentries = all.filter((w) => w.kind === "sentry");
  const timed = observers.filter((w) => w.removedAt !== null && w.removedAt > w.placedAt);
  const enough = timed.length >= MIN_TIMED_OBSERVERS;
  const lives = timed.map((w) => Math.min(OBSERVER_LIFE_SEC, w.removedAt! - w.placedAt));
  const destroyed = lives.filter((l) => l < OBSERVER_LIFE_SEC - EARLY_MARGIN_SEC).length;
  const perGame = (n: number) => (games.length > 0 ? n / games.length : null);
  const firsts = games
    .map((g) => g.wards.find((w) => w.kind === "observer")?.placedAt)
    .filter((t): t is number => t !== undefined);
  return {
    games: games.length,
    gamesWarded: games.filter((g) => g.wards.length > 0).length,
    observers: {
      placed: observers.length,
      perGame: perGame(observers.length),
      timed: timed.length,
      avgLifeSec: enough ? Math.round(lives.reduce((a, b) => a + b, 0) / lives.length) : null,
      destroyedShare: enough ? destroyed / timed.length : null,
    },
    sentries: { placed: sentries.length, perGame: perGame(sentries.length) },
    firstObserverSec: median(firsts),
  };
}

/** One ward for the map: where, when, which side you were on and how long it lasted. */
export interface MapWard {
  kind: ExtrasWard["kind"];
  side: "radiant" | "dire" | null;
  x: number;
  y: number;
  placedAt: number;
  /** Seconds up when the replay says; null otherwise. */
  lifeSec: number | null;
}

export function mapWards(games: readonly WardGame[]): MapWard[] {
  return games.flatMap((g) =>
    g.wards.map((w) => ({
      kind: w.kind,
      side: g.side,
      x: w.x,
      y: w.y,
      placedAt: w.placedAt,
      lifeSec:
        w.removedAt !== null && w.removedAt > w.placedAt
          ? Math.min(
              w.kind === "observer" ? OBSERVER_LIFE_SEC : SENTRY_LIFE_SEC,
              w.removedAt - w.placedAt,
            )
          : null,
    })),
  );
}
