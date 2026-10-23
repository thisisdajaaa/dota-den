import { jobsController } from "@/modules/jobs";

export const maxDuration = 60;

/**
 * Plus go-live alerts for schedulers other than QStash (CRON_SECRET bearer). The QStash schedule
 * (`npm run jobs:schedules`) posts to /api/jobs/streamer-alerts instead.
 */
export const GET = jobsController.cronStreamerAlerts;
