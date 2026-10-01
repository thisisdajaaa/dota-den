"use server";

import { revalidatePath } from "next/cache";
import { runMatchSync, type MatchSyncRun } from "@/app/api/cron/matches/run-match-sync";
import { getCurrentUser } from "@/modules/identity/composition";

/** Admin only: run the daily match sync now and show its result. */
export async function runMatchSyncNow(): Promise<
  { ok: true; run: MatchSyncRun } | { ok: false; error: string }
> {
  const viewer = await getCurrentUser();
  if (!viewer?.roles.includes("admin")) return { ok: false, error: "Admins only." };
  try {
    const run = await runMatchSync("admin");
    revalidatePath("/admin");
    return { ok: true, run };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "The sync failed." };
  }
}
