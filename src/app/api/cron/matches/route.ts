import { jobsController } from "@/modules/jobs";

export const maxDuration = 60;

/** Daily match sync for every player (Vercel Cron, see vercel.json). */
export const GET = jobsController.cronMatches;
