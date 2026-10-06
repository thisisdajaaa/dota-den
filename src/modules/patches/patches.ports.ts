import type { Result } from "@/common/result";
import type {
  ParseStatus,
  Patch,
  PatchDiffSummary,
  PatchReferences,
  PatchSections,
} from "./domain/patch";
import type { PatchWatchlist } from "./domain/watchlist";

export type ProviderError =
  | { type: "rate_limited"; retryAfterMs: number | null }
  | { type: "unavailable"; cause: string }
  | { type: "not_found" }
  | { type: "invalid_payload"; cause: string };

/** One row of the official patch index. */
export interface PatchListEntry {
  version: string;
  name: string;
  publishedAt: Date;
}

/** A patch as fetched and parsed by the anti-corruption layer (references not yet resolved). */
export interface FetchedPatch {
  version: string;
  name: string;
  /** From the detail payload; null when missing or invalid there. */
  publishedAt: Date | null;
  feedUrl: string;
  contentHash: string;
  parseStatus: ParseStatus;
  parseIssues: string[];
  parserVersion: number;
  sections: PatchSections;
}

export interface PatchSource {
  listPatches(): Promise<Result<PatchListEntry[], ProviderError>>;
  /** `not_found` when the feed has no notes for the version. */
  fetchPatch(version: string): Promise<Result<FetchedPatch, ProviderError>>;
  feedUrl(version: string): string;
  readonly parserVersion: number;
}

/** Ability and item ids → keys, display names and icons. */
export interface PatchReferenceCatalog {
  getReferences(): Promise<Result<PatchReferences, ProviderError>>;
}

/** What the importer needs to know about a stored patch to decide whether to write. */
export interface StoredPatchState {
  version: string;
  contentHash: string | null;
  parseStatus: ParseStatus;
  parseRevision: number;
  parserVersion: number;
  referencesResolved: boolean;
}

export interface PatchesPort {
  getState(version: string): Promise<StoredPatchState | null>;
  /** `conflict` when the version already exists (a concurrent import won). */
  insert(patch: Patch): Promise<"inserted" | "conflict">;
  /** Replace only if the stored revision is still `expectedRevision`. */
  replace(patch: Patch, expectedRevision: number): Promise<"updated" | "conflict">;
  count(): Promise<number>;
}

export interface PatchRefreshState {
  lastAttemptAt: Date | null;
  lastSuccessAt: Date | null;
}

/** Tracks scheduled/lazy refresh runs so page loads don't hammer upstream. */
export interface PatchRefreshStatePort {
  get(): Promise<PatchRefreshState | null>;
  /** Atomically claim a run unless one was attempted within `minIntervalMs`. */
  tryClaim(now: Date, minIntervalMs: number): Promise<boolean>;
  recordSuccess(now: Date): Promise<void>;
}

export interface PatchListItem {
  version: string;
  name: string;
  publishedAt: Date;
  sourceUrl: string;
  parseStatus: ParseStatus;
  fetchedAt: Date;
  summary: PatchDiffSummary;
}

export interface PatchPage {
  items: PatchListItem[];
  /** Pass as `cursor` to get the next (older) page; null at the end. */
  nextCursor: string | null;
}

export const PATCH_PAGE_DEFAULT = 20;
export const PATCH_PAGE_MAX = 50;

/** Read models for the patch hub (query side). */
export interface PatchQueriesPort {
  /** Newest version first. `cursor` is the last version of the previous page. */
  list(opts?: { cursor?: string | null; limit?: number }): Promise<PatchPage>;
  getByVersion(version: string): Promise<Patch | null>;
  latest(): Promise<PatchListItem | null>;
}

export interface PatchWatchlistsPort {
  get(userId: string): Promise<PatchWatchlist | null>;
  save(
    userId: string,
    ids: { heroIds: number[]; itemIds: number[] },
    now: Date,
  ): Promise<PatchWatchlist>;
}
