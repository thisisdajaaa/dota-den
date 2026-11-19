/**
 * QStash schedules for the recurring jobs that run more often than the daily cron. Each has a
 * fixed id, so setting them up again updates them in place.
 *
 * - streamer-alerts: Plus go-live alerts every 5 minutes (288 QStash messages a day). Each run
 *   is a no-op without Plus players, push keys or streaming-site keys.
 * - session-companion: Plus players' new games while Steam shows them in Dota, every 5 minutes.
 * - weekly-coach: the Plus Monday AI note, Mondays at 07:00 Philippine time. QStash crons are
 *   UTC and Manila has no daylight saving, so that's Sunday 23:00 UTC, all year.
 */
export const JOB_SCHEDULES = [
  { id: "dota-den-streamer-alerts", job: "streamer-alerts", cron: "*/5 * * * *" },
  { id: "dota-den-session-companion", job: "session-companion", cron: "*/5 * * * *" },
  { id: "dota-den-weekly-coach", job: "weekly-coach", cron: "0 23 * * 0" },
] as const;

export interface ScheduleSet {
  id: string;
  cron: string;
  destination: string;
}
