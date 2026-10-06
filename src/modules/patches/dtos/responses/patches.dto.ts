import { type Result } from "@/common/result";
import { type ParseStatus } from "../../domain/patch";
import type { ProviderError } from "../../patches.ports";

export type ImportOutcomeKind = "inserted" | "updated" | "unchanged" | "failed";

export interface ImportOutcome {
  version: string;
  outcome: ImportOutcomeKind;
  /** Status of the stored document after the import; null when nothing is stored. */
  parseStatus: ParseStatus | null;
  parseRevision: number | null;
  /** Why the import failed or kept the previous content. */
  reason?: string;
}

export type ImportError = { type: "provider"; error: ProviderError };

export type RefreshResult =
  | { ran: false; reason: "fresh" | "recently_attempted" }
  | { ran: true; result: Result<ImportOutcome[], ImportError> };

export interface WatchlistIds {
  heroIds?: readonly number[];
  itemIds?: readonly number[];
}
