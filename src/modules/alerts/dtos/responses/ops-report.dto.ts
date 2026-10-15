/** What /api/cron/backup-report answers. */
export interface OpsReportResultDto {
  recorded: true;
  /** Whether a failure alert went out (false when ok, or throttled). */
  alerted: boolean;
}
