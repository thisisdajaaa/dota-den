import { err, ok, type Result } from "@/common/result";
import {
  EMPTY_SECTIONS,
  resolveReferences,
  type Patch,
  type PatchReferences,
} from "../domain/patch";
import {
  comparePatchVersions,
  officialPatchUrl,
  parsePatchVersion,
  type PatchVersion,
} from "../domain/patch-version";
import type {
  FetchedPatch,
  PatchListEntry,
  PatchReferenceCatalog,
  PatchRefreshStatePort,
  PatchesPort,
  PatchSource,
  ProviderError,
  StoredPatchState,
} from "../patches.ports";
import type { ImportError, ImportOutcome, RefreshResult } from "../dtos/responses/patches.dto";

export const DEFAULT_IMPORT_COUNT = 3;
export const MAX_IMPORT_COUNT = 20;
/** Lazy refresh runs when the last successful run is older than this. */
export const PATCH_STALE_AFTER_MS = 24 * 60 * 60 * 1000;
/** Minimum gap between refresh attempts, so failures don't retry on every page load. */
export const PATCH_RETRY_AFTER_MS = 10 * 60 * 1000;

const describe = (e: ProviderError): string =>
  e.type === "unavailable" || e.type === "invalid_payload" ? `${e.type}: ${e.cause}` : e.type;

export class PatchImportService {
  private readonly now: () => Date;

  constructor(
    private readonly deps: {
      source: PatchSource;
      references: PatchReferenceCatalog;
      patches: PatchesPort;
      refreshState: PatchRefreshStatePort;
      now?: () => Date;
    },
  ) {
    this.now = deps.now ?? (() => new Date());
  }

  /** Import the newest `count` versions from the official index. */
  async importLatest(count = DEFAULT_IMPORT_COUNT): Promise<Result<ImportOutcome[], ImportError>> {
    const n = Math.min(Math.max(1, Math.trunc(count) || 1), MAX_IMPORT_COUNT);
    const list = await this.deps.source.listPatches();
    if (!list.ok) return err({ type: "provider", error: list.error });

    const newest = sortNewestFirst(list.value).slice(0, n);
    const outcomes: ImportOutcome[] = [];
    // Sequential on purpose: small n, and it keeps upstream load polite.
    for (const entry of newest) outcomes.push(await this.importOne(entry.version, entry));
    // A failed version leaves the run "unsuccessful" so the lazy refresh retries it (throttled).
    if (outcomes.every((o) => o.outcome !== "failed"))
      await this.deps.refreshState.recordSuccess(this.now());
    return ok(outcomes);
  }

  /** Import one version (e.g. an admin retry). Idempotent. */
  async importVersion(version: string): Promise<ImportOutcome> {
    const parsed = parsePatchVersion(version);
    if (!parsed.ok)
      return {
        version,
        outcome: "failed",
        parseStatus: null,
        parseRevision: null,
        reason: "invalid_version",
      };
    return this.importOne(parsed.value.value, null);
  }

  /**
   * Import the latest patches when none are stored or the last successful run is stale.
   * Attempts are throttled across instances through the refresh state.
   */
  async refreshIfStale(): Promise<RefreshResult> {
    const now = this.now();
    const [state, count] = await Promise.all([
      this.deps.refreshState.get(),
      this.deps.patches.count(),
    ]);
    const last = state?.lastSuccessAt?.getTime();
    const stale = count === 0 || last === undefined || now.getTime() - last >= PATCH_STALE_AFTER_MS;
    if (!stale) return { ran: false, reason: "fresh" };
    if (!(await this.deps.refreshState.tryClaim(now, PATCH_RETRY_AFTER_MS)))
      return { ran: false, reason: "recently_attempted" };
    return { ran: true, result: await this.importLatest() };
  }

  private async importOne(version: string, entry: PatchListEntry | null): Promise<ImportOutcome> {
    const [fetched, refs, existing] = await Promise.all([
      this.deps.source.fetchPatch(version),
      this.deps.references.getReferences(),
      this.deps.patches.getState(version),
    ]);

    if (!fetched.ok) return this.recordFetchFailure(version, entry, existing, fetched.error);

    const publishedAt =
      fetched.value.publishedAt ?? (await this.publishedAtFromIndex(version, entry));
    if (!publishedAt) {
      return {
        version,
        outcome: "failed",
        parseStatus: existing?.parseStatus ?? null,
        parseRevision: existing?.parseRevision ?? null,
        reason: "missing_publish_date",
      };
    }

    const patch = this.toPatch(fetched.value, publishedAt, refs.ok ? refs.value : null);
    if (!existing) return this.insert(patch);

    if (isUnchanged(existing, patch)) {
      return {
        version,
        outcome: "unchanged",
        parseStatus: existing.parseStatus,
        parseRevision: existing.parseRevision,
      };
    }
    // Never replace usable content with a payload we couldn't parse at all.
    if (patch.parseStatus === "failed" && existing.parseStatus !== "failed") {
      return {
        version,
        outcome: "failed",
        parseStatus: existing.parseStatus,
        parseRevision: existing.parseRevision,
        reason: "parse_failed_kept_previous",
      };
    }
    const next = { ...patch, parseRevision: existing.parseRevision + 1 };
    const res = await this.deps.patches.replace(next, existing.parseRevision);
    // A conflict means a concurrent import already stored a newer revision.
    return {
      version,
      outcome: res === "updated" ? "updated" : "unchanged",
      parseStatus: next.parseStatus,
      parseRevision: res === "updated" ? next.parseRevision : null,
    };
  }

  private async insert(patch: Patch): Promise<ImportOutcome> {
    const res = await this.deps.patches.insert(patch);
    return {
      version: patch.version,
      outcome:
        res === "inserted" ? (patch.parseStatus === "failed" ? "failed" : "inserted") : "unchanged",
      parseStatus: patch.parseStatus,
      parseRevision: res === "inserted" ? 1 : null,
      ...(patch.parseStatus === "failed" ? { reason: patch.parseIssues.join("; ") } : {}),
    };
  }

  /**
   * Upstream failed. Keep any stored content untouched. If nothing is stored but the version
   * is in the official index, store a `failed` placeholder so the hub can still show the
   * version and the official link.
   */
  private async recordFetchFailure(
    version: string,
    entry: PatchListEntry | null,
    existing: StoredPatchState | null,
    error: ProviderError,
  ): Promise<ImportOutcome> {
    const reason = describe(error);
    if (existing) {
      return {
        version,
        outcome: "failed",
        parseStatus: existing.parseStatus,
        parseRevision: existing.parseRevision,
        reason,
      };
    }
    const indexed = entry ?? (await this.findInIndex(version));
    if (!indexed)
      return { version, outcome: "failed", parseStatus: null, parseRevision: null, reason };

    const placeholder: Patch = {
      version,
      name: indexed.name,
      publishedAt: indexed.publishedAt,
      sourceUrl: officialPatchUrl(version),
      feedUrl: this.deps.source.feedUrl(version),
      language: "english",
      contentHash: null,
      parseStatus: "failed",
      parseIssues: [`fetch failed: ${reason}`],
      parseRevision: 1,
      parserVersion: this.deps.source.parserVersion,
      referencesResolved: false,
      fetchedAt: this.now(),
      sections: EMPTY_SECTIONS,
    };
    const res = await this.deps.patches.insert(placeholder);
    return {
      version,
      outcome: "failed",
      parseStatus: res === "inserted" ? "failed" : null,
      parseRevision: res === "inserted" ? 1 : null,
      reason,
    };
  }

  private toPatch(f: FetchedPatch, publishedAt: Date, refs: PatchReferences | null): Patch {
    return {
      version: f.version,
      name: f.name,
      publishedAt,
      sourceUrl: officialPatchUrl(f.version),
      feedUrl: f.feedUrl,
      language: "english",
      contentHash: f.contentHash,
      parseStatus: f.parseStatus,
      parseIssues: f.parseIssues,
      parseRevision: 1,
      parserVersion: f.parserVersion,
      referencesResolved: refs !== null,
      fetchedAt: this.now(),
      sections: refs ? resolveReferences(f.sections, refs) : f.sections,
    };
  }

  private async findInIndex(version: string): Promise<PatchListEntry | null> {
    const list = await this.deps.source.listPatches();
    return list.ok ? (list.value.find((p) => p.version === version) ?? null) : null;
  }

  private async publishedAtFromIndex(
    version: string,
    entry: PatchListEntry | null,
  ): Promise<Date | null> {
    return (entry ?? (await this.findInIndex(version)))?.publishedAt ?? null;
  }
}

/** Same upstream bytes, same parser and no newly available references → nothing to write. */
function isUnchanged(existing: StoredPatchState, next: Patch): boolean {
  return (
    existing.contentHash === next.contentHash &&
    existing.parserVersion === next.parserVersion &&
    (existing.referencesResolved || !next.referencesResolved)
  );
}

export function sortNewestFirst<T extends { version: string }>(entries: readonly T[]): T[] {
  const parsed = entries.flatMap((e) => {
    const v = parsePatchVersion(e.version);
    return v.ok ? [{ e, v: v.value }] : [];
  });
  return parsed
    .sort((a: { v: PatchVersion }, b: { v: PatchVersion }) => comparePatchVersions(b.v, a.v))
    .map((x) => x.e);
}
