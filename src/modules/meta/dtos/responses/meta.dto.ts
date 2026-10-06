import { type DuoResult } from "../../domain/lane-duos";
import { type RankedHero } from "../../domain/meta-stats";
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
