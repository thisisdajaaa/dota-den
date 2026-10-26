/**
 * QStash schedules for the recurring jobs that run more often than the daily cron. Each has a
 * fixed id, so setting them up again updates them in place.
 *
 * - streamer-alerts: Plus go-live alerts every 5 minutes (288 QStash messages a day). Each run
 *   is a no-op without Plus players, push keys or streaming-site keys.
 * - session-companion: Plus players' new games while Steam shows them in Dota, every 5 minutes.
 */
export const JOB_SCHEDULES = [
  { id: "dota-den-streamer-alerts", job: "streamer-alerts", cron: "*/5 * * * *" },
  { id: "dota-den-session-companion", job: "session-companion", cron: "*/5 * * * *" },
] as const;

export interface ScheduleSet {
  id: string;
  cron: string;
  destination: string;
}
