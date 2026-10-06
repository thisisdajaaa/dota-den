import { type PositionBreakdown } from "@/modules/meta/domain/position";
import {
  type HeroRecord,
  type ItemSummary,
  type Matchups,
  type WinRateTrend,
} from "../../domain/hero-stats";
import { type HeroProgress } from "../../domain/hero-progress";

export interface HeroOverview {
  heroId: number;
  record: HeroRecord;
  trend: WinRateTrend;
}

export interface MatchupsView {
  /** Your games on the hero according to OpenDota (the matchups' sample). */
  games: number;
  matchups: Matchups;
}

export interface HeroDetailsView {
  /** Games looked at (your most recent on the hero, up to RECENT_HERO_GAMES). */
  sample: number;
  gpm: { average: number; games: number } | null;
  xpm: { average: number; games: number } | null;
  /** null when the item catalog is unavailable (we can't tell components from items). */
  items: ItemSummary | null;
  /** Earlier vs latest of your recent games on the hero; null with too few. */
  progress: HeroProgress | null;
}

export interface LaneBreakdownView {
  breakdown: PositionBreakdown;
  windowDays: number;
}
