import "server-only";
import { logger } from "@/common/logging/logger";
import {
  openDotaConfig,
  openDotaExplorerGateway,
  openDotaGateway,
} from "@/common/providers/opendota";
import { lazy } from "@/common/utils/lazy";
import { getHeroMap } from "@/modules/matches/composition";
import { ensurePatchesFresh, getPatchQueries } from "@/modules/patches/composition";
import { OpenDotaMetaSource } from "./infrastructure/opendota-meta-source";
import { MetaService } from "./meta.service";

/** One source per server instance so its memo (with fetch times) is shared across requests. */
export const metaSource = lazy(
  () =>
    new OpenDotaMetaSource(
      { api: openDotaGateway(), explorer: openDotaExplorerGateway() },
      openDotaConfig(),
    ),
);

export const metaService = new MetaService({
  stats: metaSource,
  lanes: metaSource,
  heroes: async () => [...(await getHeroMap()).values()].map((h) => ({ id: h.id, roles: h.roles })),
  patches: {
    latest: async () => {
      await ensurePatchesFresh();
      const queries = await getPatchQueries();
      const latest = await queries.latest();
      return latest ? queries.getByVersion(latest.version) : null;
    },
  },
  logger,
});
