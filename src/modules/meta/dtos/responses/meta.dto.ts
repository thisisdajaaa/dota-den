import { type DuoResult } from "../../domain/lane-duos";
import { type OverviewPool, type ProDraftHero, type RankedHero } from "../../domain/meta-stats";
import { type Position, type RoleDerivation } from "../../domain/position";

export interface TopHeroesView {
  position: Position;
  heroes: RankedHero[];
  /** Heroes whose lane data we checked for this position. */
  checked: number;
  sources: {
    publicFetchedAt: Date;
    /** "partial" when some heroes' lane data failed; "unavailable" when all did. */
    lane: "ok" | "partial" | "unavailable";
    /** Oldest lane data used. */
    laneFetchedAt: Date | null;
    pro:
      | { status: "ok"; drafts: number; windowDays: number; fetchedAt: Date }
      | { status: "too_few"; drafts: number; windowDays: number; fetchedAt: Date }
      | { status: "unavailable" };
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
  /** When the public hero stats were fetched. */
  fetchedAt: Date;
}

export interface ContestedView {
  /** "too_few" when there are too few pro drafts in the window to say anything. */
  status: "ok" | "too_few";
  heroes: Array<ProDraftHero & { contestRate: number }>;
  drafts: number;
  windowDays: number;
  fetchedAt: Date;
}
