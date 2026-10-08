import { isLocale, DEFAULT_LOCALE } from "@/common/i18n/locales";
import { englishMessages, MESSAGES, type Messages } from "@/common/i18n/messages";
import { plural, translator, type Translator } from "@/common/i18n/translate";
import { dayKeyFormatter, isValidTimeZone } from "@/common/time/day-key";
import type { Logger } from "@/common/logging/logger";
import {
  isRecapDay,
  isRecentPatch,
  isRecentSession,
  isSessionFinished,
  weekStart,
  type NotificationMessage,
} from "../domain/notification";
import type {
  HeroNames,
  LatestSessionSource,
  NotifiedUser,
  PatchDigestSource,
  UserDirectory,
  WeeklyRecordSource,
} from "../notifications.ports";
import type { TriggerRunDto } from "../dtos/responses/notification-status.dto";
import type { NotificationService } from "./notification.service";

/** Players with no time zone saved get Manila time (the main user group). */
const FALLBACK_TIME_ZONE = "Asia/Manila";

/**
 * The daily news run (after the morning match sync): yesterday's session, Monday's weekly
 * recap and a new patch that changed your heroes. Each is sent once and only if wanted.
 */
export class NotificationTriggersService {
  private readonly now: () => Date;

  constructor(
    private readonly deps: {
      notifications: NotificationService;
      users: UserDirectory;
      sessions: LatestSessionSource;
      weekly: WeeklyRecordSource;
      patches: PatchDigestSource;
      heroes: HeroNames;
      logger: Pick<Logger, "warn">;
      now?: () => Date;
    },
  ) {
    this.now = deps.now ?? (() => new Date());
  }

  async runDaily(opts: { budgetMs: number }): Promise<TriggerRunDto> {
    const started = Date.now();
    const run: TriggerRunDto = {
      users: 0,
      sessionRecaps: 0,
      weeklyRecaps: 0,
      patchHeroes: 0,
      failed: 0,
      stoppedEarly: false,
    };
    if (!this.deps.notifications.enabled) return run;
    const ids = await this.deps.notifications.subscribedUserIds();
    const users = await this.deps.users.byIds(ids);
    const heroes = await this.deps.heroes.names().catch(() => new Map<number, string>());
    for (const user of users) {
      if (Date.now() - started > opts.budgetMs) {
        run.stoppedEarly = true;
        break;
      }
      run.users++;
      const t = this.translatorFor(user);
      // One player's failure (an upstream hiccup) must not stop the others.
      const attempt = async (name: string, task: () => Promise<number>) => {
        try {
          return (await task()) > 0 ? 1 : 0;
        } catch (error) {
          run.failed++;
          this.deps.logger.warn("notification_failed", { name, userId: user.id, error });
          return 0;
        }
      };
      const wants = await this.deps.notifications.prefs(user.id);
      if (wants.session_recap)
        run.sessionRecaps += await attempt("session_recap", () =>
          this.sessionRecap(user, t, heroes),
        );
      if (wants.weekly_recap)
        run.weeklyRecaps += await attempt("weekly_recap", () => this.weeklyRecap(user, t));
      if (wants.patch_heroes)
        run.patchHeroes += await attempt("patch_heroes", () => this.patchHeroes(user, t, heroes));
    }
    return run;
  }

  /** The "Send a test" notification. */
  testMessage(language: string | null): NotificationMessage {
    const t = this.translatorFor({ language });
    return {
      title: t("notifications.push.test.title"),
      body: t("notifications.push.test.body"),
      url: "/account#notifications",
      tag: "test",
    };
  }

  private translatorFor(user: Pick<NotifiedUser, "language">): Translator<Messages> {
    const locale = isLocale(user.language) ? user.language : DEFAULT_LOCALE;
    return translator(MESSAGES[locale], englishMessages);
  }

  private owner(user: NotifiedUser) {
    return { userId: user.id, accountId32: user.accountId32 };
  }

  private async sessionRecap(
    user: NotifiedUser,
    t: Translator<Messages>,
    heroes: Map<number, string>,
  ) {
    const now = this.now();
    const session = await this.deps.sessions.latest(this.owner(user));
    if (!session) return 0;
    if (!isSessionFinished(session.endedAt, session.gapMinutes, now)) return 0;
    if (!isRecentSession(session.endedAt, now)) return 0;
    return this.deps.notifications.notifyOnce(user.id, "session_recap", session.id, async () =>
      this.sessionMessage(t, session, heroes),
    );
  }

  private sessionMessage(
    t: Translator<Messages>,
    s: NonNullable<Awaited<ReturnType<LatestSessionSource["latest"]>>>,
    heroes: Map<number, string>,
  ): NotificationMessage {
    return {
      title: t("notifications.push.session.title", {
        wins: s.wins,
        losses: s.games - s.wins,
      }),
      body: t("notifications.push.session.body", {
        games: plural(t, "notifications.push.games", s.games),
        heroes: this.heroList(t, s.heroIds, heroes),
      }),
      url: `/sessions/${encodeURIComponent(s.id)}`,
      tag: "session-recap",
    };
  }

  private async weeklyRecap(user: NotifiedUser, t: Translator<Messages>) {
    const tz = user.timeZone && isValidTimeZone(user.timeZone) ? user.timeZone : FALLBACK_TIME_ZONE;
    const today = dayKeyFormatter(tz)(this.now());
    if (!isRecapDay(today)) return 0;
    return this.deps.notifications.notifyOnce(
      user.id,
      "weekly_recap",
      weekStart(today),
      async () => {
        const week = await this.deps.weekly.lastWeek(this.owner(user), tz);
        if (week.games === 0) return null;
        return {
          title: t("notifications.push.weekly.title", { wins: week.wins, losses: week.losses }),
          body: t("notifications.push.weekly.body", {
            games: plural(t, "notifications.push.rankedGames", week.games),
          }),
          url: "/dashboard",
          tag: "weekly-recap",
        };
      },
    );
  }

  private async patchHeroes(
    user: NotifiedUser,
    t: Translator<Messages>,
    heroes: Map<number, string>,
  ) {
    const digest = await this.deps.patches.digest(this.owner(user));
    if (!digest || digest.heroIds.length === 0) return 0;
    if (!isRecentPatch(digest.publishedAt, this.now())) return 0;
    return this.deps.notifications.notifyOnce(
      user.id,
      "patch_heroes",
      digest.version,
      async () => ({
        title: t("notifications.push.patch.title", { version: digest.version }),
        body: t("notifications.push.patch.body", {
          heroes: this.heroList(t, digest.heroIds, heroes),
        }),
        url: `/patches/${encodeURIComponent(digest.version)}`,
        tag: `patch-${digest.version}`,
      }),
    );
  }

  /** "Pudge, Lion and Axe" / "Pudge, Lion, Axe and 2 more". */
  private heroList(t: Translator<Messages>, ids: readonly number[], heroes: Map<number, string>) {
    const unique = [...new Set(ids)];
    const names = unique.map(
      (id) => heroes.get(id) ?? t("notifications.push.heroFallback", { id }),
    );
    if (names.length <= 1) return names[0] ?? "";
    if (names.length <= 3)
      return t("notifications.push.list", {
        items: names.slice(0, -1).join(", "),
        last: names[names.length - 1],
      });
    return t("notifications.push.listMore", {
      items: names.slice(0, 3).join(", "),
      more: names.length - 3,
    });
  }
}
