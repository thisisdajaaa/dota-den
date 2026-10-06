"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/modules/identity";
import { cronService, type MatchSyncRunDto } from "@/modules/jobs";
import { getT } from "@/common/i18n/server";

/** Admin only: run the daily match sync now and show its result. */
export async function runMatchSyncNow(): Promise<
  { ok: true; run: MatchSyncRunDto } | { ok: false; error: string }
> {
  const viewer = await getCurrentUser();
  const t = await getT();
  if (!viewer?.roles.includes("admin")) return { ok: false, error: t("admin.cron.adminsOnly") };
  try {
    const run = await cronService.runMatchSync("admin");
    revalidatePath("/admin");
    return { ok: true, run };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : t("admin.cron.syncFailed") };
  }
}
