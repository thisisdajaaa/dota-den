import { DEFAULT_LOCALE, isLocale } from "@/common/i18n/locales";
import { englishMessages, MESSAGES, type Messages } from "@/common/i18n/messages";
import { translator, type Translator } from "@/common/i18n/translate";
import type { Logger } from "@/common/logging/logger";
import {
  chunk,
  discordMessage,
  EMBEDS_PER_MESSAGE,
  feedWindowStart,
  formatDuration,
  LOSS_COLOR,
  MAX_MATCHES_PER_RUN,
  TEST_COLOR,
  WIN_COLOR,
  type DiscordEmbed,
  type DiscordMessage,
  type FeedMatch,
} from "../domain/feed";
import type {
  DiscordClient,
  FeedHeroes,
  FeedMatchesSource,
  FeedUser,
  FeedUsers,
  PostLogPort,
  StoredFeed,
  WebhooksRepositoryPort,
} from "../discord.ports";
import type { DiscordRunDto, FeedPostResultDto } from "../dtos/responses/discord-status.dto";

type Heroes = Awaited<ReturnType<FeedHeroes["all"]>>;

/**
 * Posts a player's new matches to their Discord webhook: only games that started after the
 * feed was turned on, each at most once (claimed in the post log first), at most
 * MAX_MATCHES_PER_RUN per run, up to 10 embeds per message.
 */
export class DiscordFeedService {
  private readonly now: () => Date;

  constructor(
    private readonly deps: {
      webhooks: WebhooksRepositoryPort;
      log: PostLogPort;
      client: DiscordClient;
      matches: FeedMatchesSource;
      users: FeedUsers;
      heroes: FeedHeroes;
      /** The app's public URL, for links to match pages. */
      appUrl: () => string;
      logger: Pick<Logger, "warn" | "info">;
      now?: () => Date;
    },
  ) {
    this.now = deps.now ?? (() => new Date());
  }

  /** After a sync imported new matches for this account (the on-visit sync). */
  async postNewFor(accountId32: number): Promise<FeedPostResultDto> {
    const feed = await this.deps.webhooks.byAccount(accountId32);
    if (!feed || !feed.enabled || feed.gone) return { posted: 0, outcome: "off" };
    const [user] = await this.deps.users.byIds([feed.userId]);
    const heroes = await this.heroes();
    return this.postFeed(feed, user ?? null, heroes);
  }

  /** Every active feed (after the daily match sync). Also retries posts an earlier run released. */
  async runAll(opts: { budgetMs: number }): Promise<DiscordRunDto> {
    const started = Date.now();
    const run: DiscordRunDto = {
      feeds: 0,
      posted: 0,
      failed: 0,
      rateLimited: false,
      stoppedEarly: false,
    };
    const feeds = await this.deps.webhooks.active();
    if (feeds.length === 0) return run;
    const users = new Map(
      (await this.deps.users.byIds(feeds.map((f) => f.userId))).map((u) => [u.id, u]),
    );
    const heroes = await this.heroes();
    for (const feed of feeds) {
      if (Date.now() - started > opts.budgetMs) {
        run.stoppedEarly = true;
        break;
      }
      run.feeds++;
      try {
        const result = await this.postFeed(feed, users.get(feed.userId) ?? null, heroes);
        run.posted += result.posted;
        if (result.outcome === "failed") run.failed++;
        if (result.outcome === "rate_limited_global") {
          // Discord is limiting every webhook from this server: stop, the next run retries.
          run.rateLimited = true;
          run.stoppedEarly = true;
          break;
        }
      } catch (error) {
        run.failed++;
        this.deps.logger.warn("discord_feed_failed", { userId: feed.userId, error });
      }
    }
    return run;
  }

  /** The "Send a test post" message, in the player's language. */
  testMessage(user: { language: string | null; name: string | null }): DiscordMessage {
    const t = this.translatorFor(user.language);
    return discordMessage([
      {
        title: t("discord.post.test.title"),
        description: t("discord.post.test.description"),
        url: `${this.appUrl()}/dashboard`,
        color: TEST_COLOR,
        ...(user.name ? { author: { name: user.name } } : {}),
      },
    ]);
  }

  private async postFeed(
    feed: StoredFeed,
    user: FeedUser | null,
    heroes: Heroes,
  ): Promise<FeedPostResultDto> {
    const { log } = this.deps;
    const now = this.now();
    const from = feedWindowStart(feed.since, now);
    const done = await log.claimedSince(feed.userId, from);
    const candidates = (
      await this.deps.matches.startedAfter(feed.accountId32, from, {
        excludeMatchIds: done,
        limit: MAX_MATCHES_PER_RUN,
      })
    )
      // Strictly after the feed was turned on: never history from before.
      .filter((m) => m.startedAt.getTime() > feed.since.getTime())
      .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
      .slice(0, MAX_MATCHES_PER_RUN);

    const claimed: FeedMatch[] = [];
    for (const m of candidates) {
      if (await log.claim(feed.userId, m.matchId, m.startedAt, now)) claimed.push(m);
    }
    if (claimed.length === 0) return { posted: 0, outcome: "nothing_new" };

    const t = this.translatorFor(user?.language ?? null);
    const batches = chunk(claimed, EMBEDS_PER_MESSAGE);
    let posted = 0;
    for (const [i, batch] of batches.entries()) {
      const message = discordMessage(batch.map((m) => this.matchEmbed(t, m, heroes, user)));
      const outcome = await this.deps.client.post(feed.target, message);
      const ids = batch.map((m) => m.matchId);
      if (outcome.kind === "ok") {
        await log.markSent(feed.userId, ids, this.now());
        posted += batch.length;
        continue;
      }
      // Not sent: let a later run try these (and the batches after them) again.
      const unsent = batches.slice(i).flatMap((b) => b.map((m) => m.matchId));
      await log.release(feed.userId, unsent);
      if (posted > 0) await this.deps.webhooks.markPosted(feed.userId, this.now());
      if (outcome.kind === "gone") {
        await this.deps.webhooks.markGone(feed.userId, this.now());
        this.deps.logger.info("discord_webhook_gone", { userId: feed.userId });
        return { posted, outcome: "gone" };
      }
      if (outcome.kind === "rate_limited") {
        this.deps.logger.warn("discord_rate_limited", {
          userId: feed.userId,
          retryAfterMs: outcome.retryAfterMs,
          global: outcome.global,
        });
        return { posted, outcome: outcome.global ? "rate_limited_global" : "rate_limited" };
      }
      this.deps.logger.warn("discord_post_failed", { userId: feed.userId, status: outcome.status });
      return { posted, outcome: "failed" };
    }
    await this.deps.webhooks.markPosted(feed.userId, this.now());
    return { posted, outcome: "posted" };
  }

  private matchEmbed(
    t: Translator<Messages>,
    m: FeedMatch,
    heroes: Heroes,
    user: FeedUser | null,
  ): DiscordEmbed {
    const hero = heroes.get(m.heroId);
    const queue =
      m.queueClass === "solo"
        ? t("discord.post.solo")
        : m.queueClass === "party"
          ? m.partySize
            ? t("discord.post.partyOf", { n: m.partySize })
            : t("discord.post.party")
          : t("discord.post.unknownQueue");
    const mode = `${m.mode ?? t("discord.post.unknownMode")} · ${t(
      m.ranked ? "discord.post.ranked" : "discord.post.unranked",
    )}`;
    return {
      title: t("discord.post.title", {
        result: t(m.result === "win" ? "discord.post.win" : "discord.post.loss"),
        hero: hero?.name ?? t("discord.post.heroFallback", { id: m.heroId }),
      }),
      url: `${this.appUrl()}/matches/${encodeURIComponent(m.matchId)}`,
      color: m.result === "win" ? WIN_COLOR : LOSS_COLOR,
      ...(user?.name ? { author: { name: user.name } } : {}),
      fields: [
        { name: t("discord.post.kda"), value: `${m.kills}/${m.deaths}/${m.assists}`, inline: true },
        { name: t("discord.post.duration"), value: formatDuration(m.durationSec), inline: true },
        { name: t("discord.post.mode"), value: mode, inline: true },
        { name: t("discord.post.queue"), value: queue, inline: true },
      ],
      ...(hero?.imageUrl ? { thumbnail: { url: hero.imageUrl } } : {}),
      footer: { text: t("discord.post.footer", { id: m.matchId }) },
      // When the game ended.
      timestamp: new Date(m.startedAt.getTime() + m.durationSec * 1000).toISOString(),
    };
  }

  private async heroes(): Promise<Heroes> {
    return this.deps.heroes.all().catch(() => new Map());
  }

  private appUrl() {
    return this.deps.appUrl().replace(/\/+$/, "");
  }

  private translatorFor(language: string | null): Translator<Messages> {
    const locale = isLocale(language) ? language : DEFAULT_LOCALE;
    return translator(MESSAGES[locale], englishMessages);
  }
}
