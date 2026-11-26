/**
 * Runes you picked up, from a parsed replay's rune log (pure). OpenDota keys each pickup by
 * Valve's rune id; an id we don't know is left out, never guessed.
 */

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

/** Valve's rune ids, as OpenDota's `runes_log` keys them. */
const RUNE_IDS: Record<string, RuneKind> = {
  "0": "double_damage",
  "1": "haste",
  "2": "illusion",
  "3": "invisibility",
  "4": "regeneration",
  "5": "bounty",
  "6": "arcane",
  "7": "water",
  "8": "wisdom",
  "9": "shield",
};

export interface RunePickup {
  kind: RuneKind;
  /** Seconds from the horn. */
  time: number;
}

/** Pickups in time order; unknown ids and broken times are dropped. */
export function runePickups(
  log: readonly { time: number; key: string | number }[] | null | undefined,
): RunePickup[] {
  return (log ?? [])
    .flatMap((r) => {
      const kind = RUNE_IDS[String(r.key)];
      return kind && Number.isFinite(r.time) ? [{ kind, time: Math.round(r.time) }] : [];
    })
    .sort((a, b) => a.time - b.time);
}
