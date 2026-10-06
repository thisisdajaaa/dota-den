import "server-only";
import { err, ok } from "@/common/result";
import {
  decodeSnapshot,
  encodeSnapshot,
  replaySnapshot,
  snapshotOf,
} from "@/modules/drafts/application/snapshot";
import { getAiOpponent } from "@/modules/drafts/composition";
import { matchesService } from "@/modules/matches";
import type { DraftReferee } from "../leaderboards.ports";

/** Replays drafts with the drafts context's engine and asks its AI captain for the outlook. */
export const draftsReferee: DraftReferee = {
  async replay(encoded) {
    const decoded = decodeSnapshot(encoded);
    if (!decoded.ok) return err({ type: "invalid_snapshot" });
    const pool = [...(await matchesService.heroMap()).keys()];
    if (pool.length === 0) return err({ type: "heroes_unavailable" });
    const replayed = replaySnapshot(decoded.value, pool);
    if (!replayed.ok) return err({ type: "invalid_snapshot" });
    const state = replayed.value;
    return ok({
      canonical: encodeSnapshot(snapshotOf(state)),
      completed: state.status === "completed",
      rulesetId: state.rulesetId,
      rulesetVersion: state.rulesetVersion,
    });
  },
  async outlook(canonical) {
    const decoded = decodeSnapshot(canonical);
    if (!decoded.ok) return null;
    const res = await (await getAiOpponent()).outlook(decoded.value);
    return res.ok ? res.value : null;
  },
};
