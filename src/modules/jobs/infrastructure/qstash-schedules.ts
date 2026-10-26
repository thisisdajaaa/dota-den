import type { Client } from "@upstash/qstash";
import { JOB_SCHEDULES, type ScheduleSet } from "../domain/schedules";

/** Creates or updates every schedule in JOB_SCHEDULES against this deployment's job endpoint. */
export async function setUpSchedules(
  client: Client,
  opts: { appUrl: string; bypass?: string },
): Promise<ScheduleSet[]> {
  const out: ScheduleSet[] = [];
  for (const s of JOB_SCHEDULES) {
    const destination = `${opts.appUrl.replace(/\/$/, "")}/api/jobs/${s.job}`;
    await client.schedules.create({
      scheduleId: s.id,
      destination,
      cron: s.cron,
      // The job endpoint's message shape; no dedup key, so every tick runs.
      body: JSON.stringify({ payload: {}, dedupKey: null }),
      headers: {
        "content-type": "application/json",
        ...(opts.bypass ? { "x-vercel-protection-bypass": opts.bypass } : {}),
      },
      // A missed tick is replaced by the next one a few minutes later.
      retries: 0,
    });
    out.push({ id: s.id, cron: s.cron, destination });
  }
  return out;
}
