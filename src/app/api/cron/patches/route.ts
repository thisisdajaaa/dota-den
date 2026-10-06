import { jobsController } from "@/modules/jobs";

export const maxDuration = 60;

/** Daily patch and tournament-data refresh (Vercel Cron, see vercel.json). */
export const GET = jobsController.cronPatches;
