"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/modules/identity";
import { cronService, type MatchSyncRunDto } from "@/modules/jobs";

/** Admin only: run the daily match sync now and show its result. */
export async function runMatchSyncNow(): Promise<
  { ok: true; run: MatchSyncRunDto } | { ok: false; error: string }
> {
  const viewer = await getCurrentUser();
  if (!viewer?.roles.includes("admin")) return { ok: false, error: "Admins only." };
  try {
    const run = await cronService.runMatchSync("admin");
    revalidatePath("/admin");
    return { ok: true, run };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "The sync failed." };
  }
}
