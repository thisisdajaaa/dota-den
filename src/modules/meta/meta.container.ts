import "server-only";
import { logger } from "@/common/logging/logger";
import {
  openDotaConfig,
  openDotaExplorerGateway,
  openDotaGateway,
} from "@/common/providers/opendota";
import { stratzConfig, stratzGateway } from "@/common/providers/stratz";
import { lazy } from "@/common/utils/lazy";
import { matchesService } from "@/modules/matches";
import { patchesService } from "@/modules/patches";
import { OpenDotaMetaSource } from "./infrastructure/opendota-meta-source";
import { StratzPositionSource } from "./infrastructure/stratz-position-source";
import type { PositionStatsSource } from "./meta.ports";
import { MetaService } from "./meta.service";

/** One source per server instance so its memo (with fetch times) is shared across requests. */
export const metaSource = lazy(
  () =>
    new OpenDotaMetaSource(
      { api: openDotaGateway(), explorer: openDotaExplorerGateway() },
      openDotaConfig(),
    ),
);

/**
 * STRATZ per-position stats, or null without STRATZ_API_TOKEN (the Meta page then places
 * heroes by OpenDota lane data and roles, as before). Built on first use.
 */
let stratz: PositionStatsSource | null | undefined;
function stratzSource(): PositionStatsSource | null {
  if (stratz === undefined) {
    const config = stratzConfig();
    stratz = config ? new StratzPositionSource(stratzGateway(), config) : null;
  }
  return stratz;
}

export const metaService = new MetaService({
  stats: metaSource,
  lanes: metaSource,
  positions: stratzSource,
  heroes: async () =>
    [...(await matchesService.heroMap()).values()].map((h) => ({ id: h.id, roles: h.roles })),
  patches: {
    latest: async () => {
      await patchesService.ensureFresh();
      const latest = await patchesService.latest();
      return latest ? patchesService.getByVersion(latest.version) : null;
    },
  },
  logger,
});
