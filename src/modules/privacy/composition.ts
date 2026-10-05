import "server-only";
import { logger } from "@/lib/logger";
import * as drafts from "@/modules/drafts/composition";
import * as identity from "@/modules/identity/composition";
import * as leaderboards from "@/modules/leaderboards/composition";
import * as matches from "@/modules/matches/composition";
import * as mmr from "@/modules/mmr/composition";
import * as patches from "@/modules/patches/composition";
import * as players from "@/modules/players/composition";
import * as sessions from "@/modules/sessions/composition";
import type { DataOwner } from "@/modules/shared/infrastructure/user-data";
import * as together from "@/modules/together/composition";

/** Every part of the app that keeps data about a player. Identity goes last on delete. */
const PARTS = [mmr, sessions, players, patches, leaderboards, drafts, matches, together];

/** Everything Dota Den keeps about you, as one JSON-ready object. */
export async function exportAllMyData(owner: DataOwner) {
  const parts = await Promise.all([identity, ...PARTS].map((p) => p.exportMyData(owner)));
  return {
    exportedAt: new Date().toISOString(),
    note: "Everything Dota Den stores about you. Matches are public OpenDota data imported for you.",
    ...Object.assign({}, ...parts),
  } as Record<string, unknown>;
}

/**
 * Deletes your account and everything stored about you. Friend-room drafts are shared, so
 * they're anonymised instead. Identity last: the account goes only once the rest is gone.
 */
export async function deleteAllMyData(owner: DataOwner) {
  const counts: Record<string, number> = {};
  for (const part of PARTS) Object.assign(counts, await part.deleteMyData(owner));
  Object.assign(counts, await identity.deleteMyData(owner));
  logger.info("account_deleted", { counts });
  return counts;
}
