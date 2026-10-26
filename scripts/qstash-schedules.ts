/**
 * Creates (or updates) the QStash schedules for recurring jobs (src/modules/jobs/domain/
 * schedules.ts). Idempotent. The admin page has the same action ("Set up job schedules").
 *
 * Usage: npm run jobs:schedules   (needs APP_URL and QSTASH_TOKEN; ADR 0008, ADR 0013)
 */
import { Client } from "@upstash/qstash";
import { env } from "@/common/config/env";
import { setUpSchedules } from "@/modules/jobs/infrastructure/qstash-schedules";

async function main(): Promise<void> {
  const { QSTASH_TOKEN, QSTASH_URL, APP_URL, VERCEL_AUTOMATION_BYPASS_SECRET: bypass } = env();
  if (!QSTASH_TOKEN) throw new Error("QSTASH_TOKEN is not set");
  const client = new Client({ token: QSTASH_TOKEN, baseUrl: QSTASH_URL });
  for (const s of await setUpSchedules(client, { appUrl: APP_URL, bypass })) {
    console.log(`Schedule ${s.id}: ${s.cron} → ${s.destination}`);
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
