import { describe, expect, it, vi } from "vitest";
import type { Client } from "@upstash/qstash";
import { JOB_SCHEDULES } from "@/modules/jobs/domain/schedules";
import { setUpSchedules } from "@/modules/jobs/infrastructure/qstash-schedules";

describe("setUpSchedules", () => {
  it("upserts every schedule by its fixed id against this deployment's job endpoint", async () => {
    const create = vi.fn(async () => ({ scheduleId: "x" }));
    const client = { schedules: { create } } as unknown as Client;
    const set = await setUpSchedules(client, { appUrl: "https://www.dota-den.com/", bypass: "b" });
    expect(set.map((s) => s.destination)).toEqual([
      "https://www.dota-den.com/api/jobs/streamer-alerts",
      "https://www.dota-den.com/api/jobs/session-companion",
    ]);
    expect(create).toHaveBeenCalledTimes(JOB_SCHEDULES.length);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduleId: "dota-den-session-companion",
        cron: "*/5 * * * *",
        retries: 0,
        headers: expect.objectContaining({ "x-vercel-protection-bypass": "b" }),
      }),
    );
  });
});
