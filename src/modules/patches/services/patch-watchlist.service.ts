import type { DataOwner } from "@/common/privacy/user-data";
import { ok, type Result } from "@/common/result";
import {
  checkWatchlistLimits,
  emptyWatchlist,
  type PatchWatchlist,
  type WatchlistError,
} from "../domain/watchlist";
import type { PatchWatchlistsPort } from "../patches.ports";
import type { WatchlistIds } from "../dtos/responses/patches.dto";

/** Commands and query for a user's patch watchlist (its own aggregate, keyed by userId). */

export class PatchWatchlistService {
  private readonly now: () => Date;

  constructor(
    private readonly deps: {
      watchlists: PatchWatchlistsPort;
      now?: () => Date;
      /** Needed for "Download your data" and account deletion only. */
      data?: {
        exportForOwner(owner: DataOwner): Promise<Record<string, unknown>[]>;
        deleteForOwner(owner: DataOwner): Promise<number>;
      };
    },
  ) {
    this.now = deps.now ?? (() => new Date());
  }

  async get(userId: string): Promise<PatchWatchlist> {
    return (await this.deps.watchlists.get(userId)) ?? emptyWatchlist(userId);
  }

  /** Replace the whole watchlist. */
  async replace(
    userId: string,
    ids: { heroIds: readonly number[]; itemIds: readonly number[] },
  ): Promise<Result<PatchWatchlist, WatchlistError>> {
    return this.save(userId, ids);
  }

  async add(userId: string, ids: WatchlistIds): Promise<Result<PatchWatchlist, WatchlistError>> {
    const current = await this.get(userId);
    return this.save(userId, {
      heroIds: [...current.heroIds, ...(ids.heroIds ?? [])],
      itemIds: [...current.itemIds, ...(ids.itemIds ?? [])],
    });
  }

  async remove(userId: string, ids: WatchlistIds): Promise<Result<PatchWatchlist, WatchlistError>> {
    const current = await this.get(userId);
    const heroes = new Set(ids.heroIds ?? []);
    const items = new Set(ids.itemIds ?? []);
    return this.save(userId, {
      heroIds: current.heroIds.filter((id) => !heroes.has(id)),
      itemIds: current.itemIds.filter((id) => !items.has(id)),
    });
  }

  private async save(
    userId: string,
    ids: { heroIds: readonly number[]; itemIds: readonly number[] },
  ): Promise<Result<PatchWatchlist, WatchlistError>> {
    const checked = checkWatchlistLimits(ids);
    if (!checked.ok) return checked;
    return ok(await this.deps.watchlists.save(userId, checked.value, this.now()));
  }

  async exportMyData(owner: DataOwner) {
    return { patchWatchlist: (await this.deps.data?.exportForOwner(owner)) ?? [] };
  }

  async deleteMyData(owner: DataOwner) {
    return { patchWatchlist: (await this.deps.data?.deleteForOwner(owner)) ?? 0 };
  }
}
