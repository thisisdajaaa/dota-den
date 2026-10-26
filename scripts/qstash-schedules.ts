/**
 * Creates (or updates) the QStash schedules for recurring jobs. Idempotent: each schedule has a
 * fixed id, so running it again updates it in place.
 *
 * Usage: npm run jobs:schedules   (needs APP_URL and QSTASH_TOKEN; ADR 0008, ADR 0013)
 *
 * - streamer-alerts: Plus go-live alerts every 5 minutes (288 QStash messages a day). Each run
 *   is a no-op without Plus players, push keys or streaming-site keys.
 */
import { Client } from "@upstash/qstash";
import { env } from "@/common/config/env";

const SCHEDULES = [
  { id: "dota-den-streamer-alerts", job: "streamer-alerts", cron: "*/5 * * * *" },
  // Plus session companion: in-game players' new games, every 5 minutes.
  { id: "dota-den-session-companion", job: "session-companion", cron: "*/5 * * * *" },
];

async function main(): Promise<void> {
  const { QSTASH_TOKEN, QSTASH_URL, APP_URL, VERCEL_AUTOMATION_BYPASS_SECRET: bypass } = env();
  if (!QSTASH_TOKEN) throw new Error("QSTASH_TOKEN is not set");
  const client = new Client({ token: QSTASH_TOKEN, baseUrl: QSTASH_URL });
  for (const s of SCHEDULES) {
    const destination = `${APP_URL.replace(/\/$/, "")}/api/jobs/${s.job}`;
    await client.schedules.create({
      scheduleId: s.id,
      destination,
      cron: s.cron,
      // The job endpoint's message shape; no dedup key, so every tick runs.
      body: JSON.stringify({ payload: {}, dedupKey: null }),
      headers: {
        "content-type": "application/json",
        ...(bypass ? { "x-vercel-protection-bypass": bypass } : {}),
      },
      // A missed tick is replaced by the next one a few minutes later.
      retries: 0,
    });
    console.log(`Schedule ${s.id}: ${s.cron} → ${destination}`);
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
