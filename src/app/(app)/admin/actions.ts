"use server";

import { revalidatePath } from "next/cache";
import { ownerAlerts, type AlertSentDto } from "@/modules/alerts";
import { getCurrentUser } from "@/modules/identity";
import { cronService, setUpJobSchedules, type MatchSyncRunDto } from "@/modules/jobs";
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

/** Admin only: send a test owner alert to every admin's devices (and Discord, if set up). */
export async function sendTestAlert(): Promise<
  { ok: true; devices: number; webhook: AlertSentDto["webhook"] } | { ok: false; error: string }
> {
  const viewer = await getCurrentUser();
  const t = await getT();
  if (!viewer?.roles.includes("admin")) return { ok: false, error: t("admin.alerts.adminsOnly") };
  try {
    const sent = await ownerAlerts.sendTest();
    revalidatePath("/admin");
    return { ok: true, ...sent };
  } catch {
    return { ok: false, error: t("admin.alerts.testFailed") };
  }
}

/** Admin only: create or update the recurring job schedules (QStash) for this deployment. */
export async function setUpSchedulesNow(): Promise<
  { ok: true; schedules: number | null } | { ok: false; error: string }
> {
  const viewer = await getCurrentUser();
  const t = await getT();
  if (!viewer?.roles.includes("admin")) return { ok: false, error: t("admin.cron.adminsOnly") };
  try {
    const set = await setUpJobSchedules();
    return { ok: true, schedules: set === null ? null : set.length };
  } catch {
    return { ok: false, error: t("admin.cron.schedulesFailed") };
  }
}
