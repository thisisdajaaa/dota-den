import "server-only";
import { z } from "zod";
import {
  NotFoundError,
  UpstreamUnavailableError,
  ValidationError,
} from "@/common/errors/app-error";
import { handler } from "@/common/http/controller";
import { requestId } from "@/common/http/http";
import { ServiceResponse } from "@/common/http/service-response";
import type { Logger } from "@/common/logging/logger";
import { requireAdmin, requireUser } from "@/modules/identity";
import { PatchListQuerySchema, RefreshSchema, WatchlistSchema } from "./schemas/patches.schema";
import { MAX_IMPORT_COUNT, type PatchImportService } from "./services/patch-import.service";
import type { PatchWatchlistService } from "./services/patch-watchlist.service";
import type { PatchesService } from "./services/patches.service";

const PUBLIC_CACHE = { "cache-control": "public, s-maxage=300, stale-while-revalidate=600" };
const NO_STORE = { "cache-control": "private, no-store" };

const watchlistDto = (w: { heroIds: number[]; itemIds: number[]; updatedAt: Date | null }) => ({
  heroIds: w.heroIds,
  itemIds: w.itemIds,
  updatedAt: w.updatedAt,
});

export class PatchesController {
  constructor(
    private readonly deps: {
      patches: PatchesService;
      watchlists: PatchWatchlistService;
      importer: () => PatchImportService;
      logger: Pick<Logger, "info" | "warn">;
    },
  ) {}

  /** GET /api/v1/patches: newest version first, cursor pagination. */
  list = handler(
    { query: PatchListQuerySchema, invalidMessage: "Invalid query" },
    async ({ query }) =>
      ServiceResponse.success(await this.deps.patches.list(query)).withHeaders(PUBLIC_CACHE),
  );

  /** GET /api/v1/patches/:version: detail with source link, parse status and fetch time. */
  detail = handler({ params: z.object({ version: z.string().max(20) }) }, async ({ params }) => {
    const patch = await this.deps.patches.detail(params.version);
    if (!patch) throw new NotFoundError("Unknown patch version");
    return ServiceResponse.success(patch).withHeaders(PUBLIC_CACHE);
  });

  /** GET /api/v1/me/patch-watchlist */
  getWatchlist = handler({ guard: requireUser }, async ({ user }) =>
    ServiceResponse.success(watchlistDto(await this.deps.watchlists.get(user.id))).withHeaders(
      NO_STORE,
    ),
  );

  /** PUT /api/v1/me/patch-watchlist: replace your watchlist. */
  putWatchlist = handler(
    { guard: requireUser, body: WatchlistSchema, invalidMessage: "Invalid body" },
    async ({ user, body }) => {
      const result = await this.deps.watchlists.replace(user.id, body);
      if (!result.ok)
        throw new ValidationError("Watchlist is too long", { limit: result.error.limit });
      return ServiceResponse.success(watchlistDto(result.value), "Watchlist saved").withHeaders(
        NO_STORE,
      );
    },
  );

  /** POST /api/v1/admin/patches/refresh: admin-only manual refresh (spec §2.3). */
  refresh = handler({ guard: requireAdmin }, async ({ req, user }) => {
    const text = await req.text();
    let json: unknown = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      throw new ValidationError("Body must be JSON");
    }
    const body = RefreshSchema(MAX_IMPORT_COUNT).safeParse(json);
    if (!body.success) throw new ValidationError("Invalid body", z.flattenError(body.error));

    const service = this.deps.importer();
    const started = Date.now();
    const log = { requestId: requestId(req), trigger: "admin", userId: user.id };
    if (body.data.version) {
      const outcome = await service.importVersion(body.data.version);
      this.deps.logger.info("patch_refresh_completed", {
        ...log,
        durationMs: Date.now() - started,
        outcomes: [outcome],
      });
      return ServiceResponse.success({ outcomes: [outcome] });
    }
    const result = await service.importLatest(body.data.count);
    const durationMs = Date.now() - started;
    if (!result.ok) {
      this.deps.logger.warn("patch_refresh_failed", {
        ...log,
        durationMs,
        reason: result.error.error.type,
      });
      throw new UpstreamUnavailableError("The official patch feed is unavailable right now.");
    }
    this.deps.logger.info("patch_refresh_completed", {
      ...log,
      durationMs,
      outcomes: result.value,
    });
    return ServiceResponse.success({ outcomes: result.value });
  });
}
