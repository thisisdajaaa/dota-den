import { type DuoResult } from "../../domain/lane-duos";
import { type OverviewPool, type ProDraftHero, type RankedHero } from "../../domain/meta-stats";
import { type Position, type RoleDerivation } from "../../domain/position";
import { type PositionStats } from "../../domain/position-stats";

export interface TopHeroesView {
  position: Position;
  heroes: RankedHero[];
  /** Heroes checked for this position (lane data fetched, or position stats that qualified). */
  checked: number;
  sources: {
    /** OpenDota hero stats; null when they failed and the ranking used STRATZ alone. */
    publicFetchedAt: Date | null;
    /**
     * "partial" when some heroes' lane data failed; "unavailable" when all did; "not_used"
     * when STRATZ position stats placed the heroes instead.
     */
    lane: "ok" | "partial" | "unavailable" | "not_used";
    /** Oldest lane data used. */
    laneFetchedAt: Date | null;
    pro:
      | { status: "ok"; drafts: number; windowDays: number; fetchedAt: Date }
      | { status: "too_few"; drafts: number; windowDays: number; fetchedAt: Date }
      | { status: "unavailable" };
    /**
     * STRATZ position stats: "ok" when they ranked this list; "unavailable" when STRATZ failed
     * and lane data was used; "off" when no STRATZ token is configured.
     */
    positions:
      | { status: "ok"; fetchedAt: Date; window: PositionStats["window"] }
      | { status: "unavailable" }
      | { status: "off" };
  };
}

export interface DuosView {
  result: DuoResult;
  windowDays: number | null;
  fetchedAt: Date | null;
}

export interface RoleView {
  derivation: RoleDerivation;
  windowDays: number;
  fetchedAt: Date;
}

export interface OverviewView {
  pools: OverviewPool[];
  /** When the ranking's main data was fetched: STRATZ position stats, else OpenDota hero stats. */
  fetchedAt: Date;
  /** The STRATZ window when heroes were placed by position stats; null when by lane data. */
  positions: { window: PositionStats["window"] } | null;
}

export interface ContestedView {
  /** "too_few" when there are too few pro drafts in the window to say anything. */
  status: "ok" | "too_few";
  heroes: Array<ProDraftHero & { contestRate: number }>;
  drafts: number;
  windowDays: number;
  fetchedAt: Date;
}
