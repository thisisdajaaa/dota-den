import { plural, type Translator } from "@/common/i18n/translate";
import { LOCALE_TAGS, type Locale } from "@/common/i18n/locales";
import type { Messages } from "@/common/i18n/messages";
import type { Logger } from "@/common/logging/logger";
import { addDays, dayKeyFormatter, isValidTimeZone, type DayKey } from "@/common/time/day-key";
import { isRecapDay, weekStart } from "@/modules/notifications/domain/notification";
import {
  DIGEST_KIND,
  longestLossStreak,
  newAchievement,
  pickNote,
  tiltNote,
  type DigestNote,
  type DigestWeek,
} from "../domain/digest";
import type { EmailContent } from "../domain/email-template";
import type {
  DigestUser,
  EmailLinks,
  HeroNames,
  PlayHistorySource,
  UserDirectory,
  WeekSource,
} from "../email.ports";
import type { DigestRunDto } from "../dtos/responses/email-status.dto";
import type { EmailService, Subscriber } from "./email.service";

/** Players with no time zone saved get Manila time (the main user group), as notifications do. */
const FALLBACK_TIME_ZONE = "Asia/Manila";

const percent = (rate: number) => `${Math.round(rate * 100)}%`;
const signed = (v: number) =>
  `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v).toLocaleString("en-US")}`;

/**
 * The weekly email (after the daily match sync): on Mondays in the player's time zone, last
 * week's ranked record, MMR change (only when exact), heroes and one honest note. Sent once
 * per week, only to confirmed addresses, and only if they played ranked that week.
 */
export class EmailDigestService {
  private readonly now: () => Date;

  constructor(
    private readonly deps: {
      email: EmailService;
      users: UserDirectory;
      weeks: WeekSource;
      history: PlayHistorySource;
      heroes: HeroNames;
      links: EmailLinks;
      logger: Pick<Logger, "warn">;
      now?: () => Date;
    },
  ) {
    this.now = deps.now ?? (() => new Date());
  }

  async runDaily(opts: { budgetMs: number }): Promise<DigestRunDto> {
    const started = Date.now();
    const run: DigestRunDto = { users: 0, sent: 0, skipped: 0, failed: 0, stoppedEarly: false };
    if (!this.deps.email.enabled) return run;
    const subscribers = await this.deps.email.confirmedSubscribers();
    if (subscribers.length === 0) return run;
    const users = new Map(
      (await this.deps.users.byIds(subscribers.map((s) => s.userId))).map((u) => [u.id, u]),
    );
    let heroes: Promise<Map<number, string>> | null = null;
    const heroNames = () =>
      (heroes ??= this.deps.heroes.names().catch(() => new Map<number, string>()));
    for (const sub of subscribers) {
      if (Date.now() - started > opts.budgetMs) {
        run.stoppedEarly = true;
        break;
      }
      const user = users.get(sub.userId);
      if (!user) continue;
      run.users++;
      try {
        const result = await this.sendFor(sub, user, heroNames);
        if (result === "sent") run.sent++;
        else if (result === "failed") run.failed++;
        else run.skipped++;
      } catch (error) {
        // One player's failure (an upstream hiccup) must not stop the others.
        run.failed++;
        this.deps.logger.warn("email_digest_failed", { userId: user.id, error });
      }
    }
    return run;
  }

  private async sendFor(
    sub: Subscriber,
    user: DigestUser,
    heroNames: () => Promise<Map<number, string>>,
  ) {
    const tz = user.timeZone && isValidTimeZone(user.timeZone) ? user.timeZone : FALLBACK_TIME_ZONE;
    const today = dayKeyFormatter(tz)(this.now());
    if (!isRecapDay(today)) return "skipped";
    return this.deps.email.sendOnce(sub, DIGEST_KIND, weekStart(today), async (unsubscribe) => {
      const owner = { userId: user.id, accountId32: user.accountId32 };
      const recap = await this.deps.weeks.week(owner, tz, addDays(today, -7));
      if (recap.games === 0) return null;
      const week: DigestWeek = {
        from: recap.from,
        to: recap.to,
        games: recap.games,
        wins: recap.wins,
        losses: recap.losses,
        mmrExact: recap.mmr.exact,
        mostPlayed: recap.mostPlayed,
        best: recap.best,
      };
      const [note, heroes] = await Promise.all([this.note(owner, tz, week), heroNames()]);
      return this.content(user.language, week, note, heroes, unsubscribe);
    });
  }

  /** One observation the player's own data supports, or none (a failed lookup means none). */
  private async note(
    owner: { userId: string; accountId32: number },
    tz: string,
    week: DigestWeek,
  ): Promise<DigestNote | null> {
    try {
      const [sessions, stats] = await Promise.all([
        this.deps.history.rankedSessions(owner),
        this.deps.history.tiltStats(owner),
      ]);
      const dayKey = dayKeyFormatter(tz);
      const weekOf = (d: Date) => {
        const k = dayKey(d);
        return k < week.from ? -1 : k > week.to ? 1 : 0;
      };
      return pickNote(
        newAchievement(sessions, weekOf),
        tiltNote(stats, longestLossStreak(sessions, weekOf)),
      );
    } catch (error) {
      this.deps.logger.warn("email_digest_note_failed", { userId: owner.userId, error });
      return null;
    }
  }

  /** The email in the player's language. Exposed for tests and previews. */
  content(
    language: string | null,
    week: DigestWeek,
    note: DigestNote | null,
    heroes: Map<number, string>,
    unsubscribe: { page: string },
  ): EmailContent {
    const { t, locale } = this.deps.email.translatorFor(language);
    const heroName = (id: number) => heroes.get(id) ?? t("email.digest.heroFallback", { id });
    const heroValue = (h: { heroId: number; games: number; wins: number }) =>
      t("email.digest.heroValue", {
        hero: heroName(h.heroId),
        wins: h.wins,
        losses: h.games - h.wins,
      });
    const rows: Array<{ label: string; value: string }> = [
      {
        label: t("email.digest.record"),
        value: t("email.digest.recordValue", {
          wins: week.wins,
          losses: week.losses,
          rate: percent(week.wins / week.games),
        }),
      },
    ];
    if (week.mmrExact !== null)
      rows.push({ label: t("email.digest.mmr"), value: signed(week.mmrExact) });
    if (week.mostPlayed)
      rows.push({ label: t("email.digest.mostPlayed"), value: heroValue(week.mostPlayed) });
    if (week.best && week.best.heroId !== week.mostPlayed?.heroId)
      rows.push({ label: t("email.digest.best"), value: heroValue(week.best) });

    const paragraphs: string[] = [];
    if (note) paragraphs.push(this.noteText(t, note));
    if (week.mmrExact === null) paragraphs.push(t("email.digest.mmrHint"));

    return {
      lang: LOCALE_TAGS[locale],
      subject: t("email.digest.subject", { wins: week.wins, losses: week.losses }),
      preheader: t("email.digest.preheader", {
        games: plural(t, "email.digest.rankedGames", week.games),
      }),
      kicker: t("email.digest.range", {
        from: this.day(week.from, locale),
        to: this.day(week.to, locale),
      }),
      heading: t("email.digest.heading"),
      rows,
      paragraphs,
      action: { label: t("email.digest.action"), url: this.deps.links.dashboard() },
      footer: [t("email.digest.why")],
      footerLinks: [
        { label: t("email.digest.unsubscribe"), url: unsubscribe.page },
        { label: t("email.digest.settings"), url: this.deps.links.account() },
      ],
    };
  }

  private noteText(t: Translator<Messages>, note: DigestNote): string {
    if (note.kind === "achievement")
      return t("email.digest.achievement", {
        title: t(`achievements.items.${note.id}.title`),
        description: t(`achievements.items.${note.id}.description`, {
          n: note.n.toLocaleString("en-US"),
        }),
      });
    return t("email.digest.tilt", {
      streak: note.streak,
      k: note.streak >= 3 ? 3 : 2,
      rate: percent(note.after.rate),
      games: note.after.games,
      baseline: percent(note.baseline.rate),
    });
  }

  private day(key: DayKey, locale: Locale): string {
    try {
      return new Intl.DateTimeFormat(LOCALE_TAGS[locale], {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${key}T12:00:00Z`));
    } catch {
      return key;
    }
  }
}
