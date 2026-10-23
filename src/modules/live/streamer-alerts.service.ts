import { isLocale, DEFAULT_LOCALE } from "@/common/i18n/locales";
import { englishMessages, MESSAGES } from "@/common/i18n/messages";
import { translator } from "@/common/i18n/translate";
import type { Logger } from "@/common/logging/logger";
import { mapLimit } from "@/common/utils/map-limit";
import { alertKey, isFreshStart } from "./domain/alerts";
import { PLATFORM_NAMES, type Platform } from "./domain/platform";
import type { StreamerFollow } from "./domain/streams";
import type { LiveStream } from "./domain/watch";
import type { StreamDirectory } from "./live.ports";
import type { StreamerAlertsRunDto } from "./dtos/responses/streamer-alerts.dto";

/** A message the notifications feature sends once per (user, key). */
export interface AlertMessage {
  title: string;
  body: string;
  url: string;
  tag: string;
}

export interface StreamerAlertsDeps {
  /** Users with Plus right now ([] when Plus is off: the run is then a no-op). */
  plusUserIds: () => Promise<string[]>;
  notifications: {
    readonly enabled: boolean;
    subscribedUserIds(): Promise<string[]>;
    wants(userId: string): Promise<boolean>;
    /** Sends at most once per user and key; returns the devices reached. */
    notifyOnce(
      userId: string,
      key: string,
      build: () => Promise<AlertMessage | null>,
    ): Promise<number>;
  };
  follows: { forUsers(userIds: readonly string[]): Promise<StreamerFollow[]> };
  directories: readonly StreamDirectory[];
  languages: (userIds: readonly string[]) => Promise<Map<string, string | null>>;
  logger: Pick<Logger, "warn">;
  now?: () => Date;
}

/**
 * Go-live alerts, a Plus feature (ADR 0013): a push when a channel a Plus player follows starts
 * streaming. Runs every few minutes from a QStash schedule (or an external cron); cheap when
 * there's nothing to do: no Plus players, no push keys or no streaming sites means no upstream
 * call at all.
 *
 * Each site is asked once per run for every followed channel (Twitch: 100 logins per request,
 * Kick: 50 slugs, as its API allows), so the cost grows with distinct channels, not players. One
 * push per channel per stream session: the session is the stream's start time, so a run that
 * sees the same stream again sends nothing.
 */
export class StreamerAlertsService {
  private readonly now: () => Date;

  constructor(private readonly deps: StreamerAlertsDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async run(): Promise<StreamerAlertsRunDto> {
    const run: StreamerAlertsRunDto = {
      users: 0,
      channels: 0,
      live: 0,
      sent: 0,
      failed: 0,
      skipped: null,
    };
    const { notifications, directories } = this.deps;
    if (!notifications.enabled) return { ...run, skipped: "disabled" };
    const plus = await this.deps.plusUserIds();
    if (plus.length === 0) return { ...run, skipped: "no_plus_users" };
    if (directories.length === 0) return { ...run, skipped: "no_sites" };

    const devices = new Set(await notifications.subscribedUserIds());
    const withDevices = plus.filter((id) => devices.has(id));
    const wanted = (
      await mapLimit(withDevices, 10, async (id) => ((await notifications.wants(id)) ? id : null))
    ).filter((id): id is string => id !== null);
    if (wanted.length === 0) return { ...run, skipped: "no_devices" };
    run.users = wanted.length;

    const follows = await this.deps.follows.forUsers(wanted);
    const live = await this.liveBySite(follows);
    run.channels = new Set(follows.map((f) => `${f.platform}:${f.login.toLowerCase()}`)).size;

    const now = this.now();
    const due = follows.flatMap((f) => {
      const stream = live.get(f.platform)?.get(f.login.toLowerCase());
      return stream && isFreshStart(stream.startedAt ?? null, now) ? [{ follow: f, stream }] : [];
    });
    run.live = new Set(due.map((d) => `${d.follow.platform}:${d.follow.channelId}`)).size;
    if (due.length === 0) return run;

    const languages = await this.deps.languages([...new Set(due.map((d) => d.follow.userId))]);
    await mapLimit(due, 10, async ({ follow, stream }) => {
      try {
        const key = alertKey(follow.platform, follow.channelId, stream.startedAt ?? null, now);
        const reached = await notifications.notifyOnce(follow.userId, key, async () =>
          this.message(follow, stream, languages.get(follow.userId) ?? null),
        );
        if (reached > 0) run.sent++;
      } catch (error) {
        run.failed++;
        this.deps.logger.warn("streamer_alert_failed", { platform: follow.platform, error });
      }
    });
    return run;
  }

  /** Who is live on each site, among the followed channels; a site that fails is skipped. */
  private async liveBySite(follows: readonly StreamerFollow[]) {
    const bySite = new Map<Platform, ReadonlyMap<string, LiveStream>>();
    await Promise.all(
      this.deps.directories.map(async (d) => {
        const logins = [
          ...new Set(follows.filter((f) => f.platform === d.platform).map((f) => f.login)),
        ];
        if (logins.length === 0) return;
        const found = await d.liveByChannels(logins).catch(() => null);
        if (found) bySite.set(d.platform, found);
        else this.deps.logger.warn("streamer_alert_site_unavailable", { platform: d.platform });
      }),
    );
    return bySite;
  }

  private message(
    follow: StreamerFollow,
    stream: LiveStream,
    language: string | null,
  ): AlertMessage {
    const t = translator(MESSAGES[isLocale(language) ? language : DEFAULT_LOCALE], englishMessages);
    const title = stream.title.trim().slice(0, 140);
    return {
      title: t("notifications.push.live.title", { name: stream.displayName || follow.displayName }),
      body: title
        ? t("notifications.push.live.body", { title })
        : t("notifications.push.live.bodyNoTitle", { site: PLATFORM_NAMES[follow.platform] }),
      url: "/live",
      tag: `live-${follow.platform}-${follow.channelId}`,
    };
  }
}
