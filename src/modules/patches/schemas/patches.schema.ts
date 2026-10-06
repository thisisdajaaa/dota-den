import { z } from "zod";
import { PATCH_PAGE_DEFAULT, PATCH_PAGE_MAX } from "../patches.ports";
import { parsePatchVersion } from "../domain/patch-version";
import { WATCHLIST_MAX_HEROES, WATCHLIST_MAX_ITEMS } from "../domain/watchlist";

/** GET /api/v1/patches */
export const PatchListQuerySchema = z.object({
  cursor: z
    .string()
    .max(10)
    .refine((v) => parsePatchVersion(v).ok, "invalid cursor")
    .optional(),
  limit: z.coerce.number().int().min(1).max(PATCH_PAGE_MAX).default(PATCH_PAGE_DEFAULT),
});

const id = z.number().int().positive().max(100_000);

/** PUT /api/v1/me/patch-watchlist */
export const WatchlistSchema = z
  .object({
    heroIds: z.array(id).max(WATCHLIST_MAX_HEROES),
    itemIds: z.array(id).max(WATCHLIST_MAX_ITEMS).default([]),
  })
  .strict();

/** POST /api/v1/admin/patches/refresh (admins only). */
export const RefreshSchema = (maxCount: number) =>
  z
    .object({
      /** Import one version (retry). */
      version: z.string().min(1).max(10).optional(),
      /** Otherwise import the newest `count` versions (default 3). */
      count: z.number().int().min(1).max(maxCount).optional(),
    })
    .strict();
