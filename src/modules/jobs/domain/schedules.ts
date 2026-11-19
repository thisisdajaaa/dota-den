/**
 * QStash schedules for the recurring jobs that run more often than the daily cron. Each has a
 * fixed id, so setting them up again updates them in place.
 *
 * - streamer-alerts: Plus go-live alerts every 5 minutes (288 QStash messages a day). Each run
 *   is a no-op without Plus players, push keys or streaming-site keys.
 * - session-companion: Plus players' new games while Steam shows them in Dota, every 5 minutes.
 * - weekly-coach: the Plus Monday AI note, Mondays at 07:00 Philippine time. QStash crons are
 *   UTC and Manila has no daylight saving, so that's Sunday 23:00 UTC, all year.
 * - discord-recap: the Discord bot's Monday server recap, Mondays at 09:00 Philippine time
 *   (Monday 01:00 UTC), after the weekly coach notes. A no-op without the bot token.
 */
export const JOB_SCHEDULES = [
  { id: "dota-den-streamer-alerts", job: "streamer-alerts", cron: "*/5 * * * *" },
  { id: "dota-den-session-companion", job: "session-companion", cron: "*/5 * * * *" },
  { id: "dota-den-weekly-coach", job: "weekly-coach", cron: "0 23 * * 0" },
  { id: "dota-den-discord-recap", job: "discord-recap", cron: "0 1 * * 1" },
] as const;

export interface ScheduleSet {
  id: string;
  cron: string;
  destination: string;
}
