import { alertsController } from "@/modules/alerts";

export const maxDuration = 30;

/** Backup and restore-drill outcomes from GitHub Actions (CRON_SECRET bearer). */
export const POST = alertsController.opsReport;
