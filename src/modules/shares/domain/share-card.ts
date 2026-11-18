/**
 * Share cards: the image a share link previews with (and the one players download). Pure: it
 * picks which moment a snapshot shows and how loud the copy is; the words live in the
 * messages (ui/share-card-text.ts). Every number comes from the snapshot as it was shared.
 */
import type { MatchShare, ShareSnapshot } from "./share";

export const CARD_FORMATS = ["wide", "square"] as const;
export type CardFormat = (typeof CARD_FORMATS)[number];

/** wide: link previews (Open Graph); square: Facebook posts and stories. */
export const CARD_SIZES: Record<CardFormat, { width: number; height: number }> = {
  wide: { width: 1200, height: 630 },
  square: { width: 1080, height: 1080 },
};

export const isCardFormat = (v: unknown): v is CardFormat =>
  typeof v === "string" && (CARD_FORMATS as readonly string[]).includes(v);

/** Printed on every card so people who see it can find us. */
export const CARD_SITE = "dota-den.com";

/** How a run of games went, loudest first. */
export type RecordTier = "flawless" | "good" | "even" | "tough";

export function recordTier(s: { wins: number; losses: number }): RecordTier {
  if (s.losses === 0 && s.wins >= 3) return "flawless";
  if (s.wins > s.losses) return "good";
  if (s.wins === s.losses) return "even";
  return "tough";
}

export type StreakTier = "roll" | "hot" | "legendary";

/** 3–4 wins: on a roll; 5–6: hot; 7 or more: legendary. */
export function streakTier(n: number): StreakTier {
  if (n >= 7) return "legendary";
  if (n >= 5) return "hot";
  return "roll";
}

/** The stat a single game's card leads with. */
export type Standout = "kills" | "kda" | "damage" | "gpm" | "none";

/** Where each stat starts to stand out (per minute for damage, so long games don't win). */
export const STANDOUT_BARS = {
  kills: 15,
  /** (K + A) / max(D, 1) */
  kda: 6,
  damagePerMin: 900,
  gpm: 700,
} as const;

export function kdaRatio(g: { kills: number; deaths: number; assists: number }): number {
  return (g.kills + g.assists) / Math.max(g.deaths, 1);
}

/**
 * The game's most impressive number, relative to its bar; "none" when nothing clears one.
 * Stats the upstream didn't report (null) are never picked.
 */
export function pickStandout(
  g: Pick<MatchShare, "kills" | "deaths" | "assists" | "heroDamage" | "goldPerMin" | "durationSec">,
): Standout {
  const minutes = Math.max(g.durationSec / 60, 1);
  const scores: Array<[Standout, number]> = [
    ["kills", g.kills / STANDOUT_BARS.kills],
    ["kda", kdaRatio(g) / STANDOUT_BARS.kda],
    ["damage", g.heroDamage === null ? 0 : g.heroDamage / minutes / STANDOUT_BARS.damagePerMin],
    ["gpm", g.goldPerMin === null ? 0 : g.goldPerMin / STANDOUT_BARS.gpm],
  ];
  let best: Standout = "none";
  let bestScore = 0;
  // A stat must clear its bar; ties keep the earlier (simpler) stat.
  for (const [stat, score] of scores)
    if (score >= 1 && score > bestScore) {
      best = stat;
      bestScore = score;
    }
  return best;
}

/** Which headline a card uses: a message key under `shares.card.headline`, and its tone. */
export type CardMoment =
  | { kind: "streak"; tier: StreakTier }
  | { kind: "session"; tier: RecordTier }
  | { kind: "week"; tier: RecordTier }
  | { kind: "match"; result: "win" | "loss"; standout: Standout }
  | { kind: "journey"; climbed: boolean };

export function cardMoment(s: ShareSnapshot): CardMoment {
  switch (s.kind) {
    case "streak":
      return { kind: "streak", tier: streakTier(s.games) };
    case "session":
      return { kind: "session", tier: recordTier(s) };
    case "week":
      return { kind: "week", tier: recordTier(s) };
    case "match":
      return { kind: "match", result: s.result, standout: pickStandout(s) };
    case "journey":
      return { kind: "journey", climbed: s.climb !== null };
  }
}

/** The card's accent: wins teal, losses red, the rest gold. */
export function cardTone(m: CardMoment): "win" | "loss" | "gold" {
  if (m.kind === "match") return m.result === "win" ? "win" : "loss";
  if (m.kind === "session" || m.kind === "week")
    return m.tier === "tough" ? "loss" : m.tier === "even" ? "gold" : "win";
  return "gold";
}

/** Big numbers short enough for a card: 1,234 → "1,234"; 45,210 → "45.2k". */
export function compactNumber(n: number): string {
  if (Math.abs(n) < 10_000) return n.toLocaleString("en-US");
  return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
}

/** Facebook's share dialog for a link (no SDK: Facebook reads the page's og: tags). */
export const facebookShareUrl = (url: string) =>
  `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
