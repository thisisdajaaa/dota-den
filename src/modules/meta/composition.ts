import "server-only";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getHeroMap, openDotaGateway } from "@/modules/matches/composition";
import { ensurePatchesFresh, getPatchQueries } from "@/modules/patches/composition";
import type { Patch } from "@/modules/patches/domain/patch";
import { ProviderGateway } from "@/modules/shared/infrastructure/provider-gateway";
import { MetaService } from "./application/meta-service";
import type { MetaStatsSource, PlayerLaneHistory } from "./application/ports";
import type { HeroPatchChange, LatestPatch } from "./domain/patch-tips";
import { OpenDotaMetaSource } from "./infrastructure/opendota-meta-source";

// One source per server instance so its memo (with fetch times) is shared across requests.
const globalForMeta = globalThis as typeof globalThis & {
  __ddMetaSource?: OpenDotaMetaSource;
};

function metaSource(): OpenDotaMetaSource {
  if (globalForMeta.__ddMetaSource) return globalForMeta.__ddMetaSource;
  const {
    OPENDOTA_API_KEY,
    OPENDOTA_BASE_URL,
    OPENDOTA_EXPLORER_TIMEOUT_MS,
    OPENDOTA_EXPLORER_MAX_RETRIES,
  } = env();
  // The explorer runs SQL on OpenDota's pro database: slow (the duo query takes ~12s) and
  // sometimes down. Its own gateway has a long timeout and a separate circuit, so explorer
  // trouble never trips the circuit for the rest of the OpenDota API.
  const explorer = new ProviderGateway({
    name: "opendota-explorer",
    timeoutMs: OPENDOTA_EXPLORER_TIMEOUT_MS,
    maxRetries: OPENDOTA_EXPLORER_MAX_RETRIES,
    onRequest: ({ status, durationMs, attempt }) =>
      logger.info("provider_request", {
        provider: "opendota-explorer",
        path: "/api/explorer",
        status,
        durationMs,
        attempt,
      }),
  });
  globalForMeta.__ddMetaSource = new OpenDotaMetaSource(
    { api: openDotaGateway(), explorer },
    { apiKey: OPENDOTA_API_KEY, baseUrl: OPENDOTA_BASE_URL },
  );
  return globalForMeta.__ddMetaSource;
}

/**
 * A player's recent games with lane info (and results), from the same cached upstream call
 * the Meta page uses to read their position.
 */
export function getPlayerLaneHistory(): PlayerLaneHistory {
  return metaSource();
}

/** Public high-rank (Ancient–Immortal) hero stats, cached like the Meta page's. */
export function getHighRankHeroStats(): MetaStatsSource["heroStats"] {
  const source = metaSource();
  return () => source.heroStats();
}

export async function getMetaService(): Promise<MetaService> {
  const heroes = [...(await getHeroMap()).values()].map((h) => ({ id: h.id, roles: h.roles }));
  return new MetaService({ stats: metaSource(), lanes: metaSource(), heroes });
}

/** Hero notes of a patch as plain lines, in patch order (Valve's wording, never rewritten). */
export function heroPatchChanges(patch: Pick<Patch, "sections">): Map<number, HeroPatchChange> {
  const out = new Map<number, HeroPatchChange>();
  for (const h of patch.sections.heroes) {
    const lines = [
      ...h.heroNotes.filter((n) => !n.subtitle).map((n) => n.text),
      ...h.abilities.flatMap((a) =>
        a.notes
          .filter((n) => !n.subtitle)
          .map((n) => (a.abilityName ? `${a.abilityName}: ${n.text}` : n.text)),
      ),
      ...h.talentNotes.filter((n) => !n.subtitle).map((n) => `Talent: ${n.text}`),
    ].filter((l) => l.trim() !== "");
    out.set(h.heroId, { heroId: h.heroId, lines });
  }
  return out;
}

export type LatestPatchResult =
  { status: "ok"; patch: LatestPatch } | { status: "none" } | { status: "unavailable" };

/** The newest imported patch with its hero changes. Never throws. */
export async function getLatestPatchForMeta(): Promise<LatestPatchResult> {
  try {
    await ensurePatchesFresh();
    const queries = await getPatchQueries();
    const latest = await queries.latest();
    if (!latest) return { status: "none" };
    const patch = await queries.getByVersion(latest.version);
    if (!patch) return { status: "none" };
    return {
      status: "ok",
      patch: {
        version: patch.version,
        publishedAt: patch.publishedAt,
        heroes: heroPatchChanges(patch),
      },
    };
  } catch (e) {
    logger.warn("meta_patch_unavailable", { error: e });
    return { status: "unavailable" };
  }
}
