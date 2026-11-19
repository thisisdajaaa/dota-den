import type { Logger } from "@/common/logging/logger";
import type { DataOwner } from "@/common/privacy/user-data";
import { addDays } from "@/common/time/day-key";
import { escapeMarkdown, type BotGame, type BotLocale } from "../domain/bot";
import type { BotHero } from "../domain/hero-match";
import {
  isFinishedRecapWeek,
  lastRecapWeek,
  nudgeKey,
  nudgeTarget,
  RECAP_MEMBERS,
  serverRecap,
  wantsRecap,
  type NudgeKind,
} from "../domain/server";
import type {
  BotLogPort,
  BotMessage,
  DiscordApiPort,
  DiscordGuildsPort,
  DiscordLinksPort,
} from "../discord.ports";
import { BRAND, plural, type Translate } from "./discord-bot.service";

const NO_MENTIONS = { parse: [] as string[] };

export type RecapOutcome =
  "posted" | "invalid" | "off" | "already_posted" | "not_plus" | "no_games" | "cant_post";

/** A nudge from the session companion: already worded in the member's language. */
export interface DiscordNudge {
  kind: NudgeKind;
  /** What makes it once-only (the session and rule, or the match). */
  occasion: string;
  title: string;
  body: string;
  /** Path in the app. */
  url: string;
}

/**
 * The bot's server features: the Monday recap (a QStash schedule ticks, one job per server
 * posts it) and members' tilt / stop-loss nudges. Each post is claimed once in the bot log,
 * so retries and overlapping runs never post twice.
 */
export class DiscordServerService {
  constructor(
    private readonly deps: {
      links: DiscordLinksPort;
      guilds: DiscordGuildsPort;
      log: BotLogPort;
      api: DiscordApiPort;
      games: (accountId32: number) => Promise<BotGame[]>;
      heroes: () => Promise<BotHero[]>;
      isPlus: (userId: string) => Promise<boolean>;
      translator: (locale: BotLocale) => Translate;
      /** Queues one server's recap job (dedup per server and week). */
      enqueueRecap: (job: { guildId: string; week: string }) => Promise<void>;
      appUrl: string;
      /** Counts a use (admin usage numbers); never fails. */
      used?: (feature: "discord_recap" | "discord_nudge", userId: string) => Promise<void>;
      logger: Pick<Logger, "info" | "warn">;
      now?: () => Date;
    },
  ) {}

  private now() {
    return this.deps.now?.() ?? new Date();
  }

  /** The Monday tick: one recap job per server that wants one and hasn't had this week's. */
  async runRecapSchedule(): Promise<{ week: string; servers: number; queued: number; off?: true }> {
    const week = lastRecapWeek(this.now());
    if (!this.deps.api.canPost) return { week, servers: 0, queued: 0, off: true };
    const guilds = await this.deps.guilds.withRecap();
    let queued = 0;
    for (const g of guilds) {
      if (g.lastRecapWeek === week) continue;
      try {
        await this.deps.enqueueRecap({ guildId: g.guildId, week });
        queued++;
      } catch (error) {
        this.deps.logger.warn("discord_recap_enqueue_failed", { week, error });
      }
    }
    this.deps.logger.info("discord_recap_scheduled", { week, servers: guilds.length, queued });
    return { week, servers: guilds.length, queued };
  }

  /**
   * One server's recap (the job). Throws only when a retry could help (Discord busy or down);
   * everything else is an outcome.
   */
  async postRecap(payload: Record<string, unknown>): Promise<RecapOutcome> {
    const now = this.now();
    const guildId = typeof payload.guildId === "string" ? payload.guildId : "";
    const week = payload.week;
    if (!/^\d{15,25}$/.test(guildId) || !isFinishedRecapWeek(week, now)) return "invalid";
    if (!this.deps.api.canPost) return "off";
    const guild = await this.deps.guilds.get(guildId);
    if (!guild || !wantsRecap(guild)) return "off";
    if (guild.lastRecapWeek === week) return "already_posted";
    // Checked when it runs: Plus can lapse after the server was set up.
    if (!(await this.deps.isPlus(guild.userId).catch(() => false))) return "not_plus";
    const claimId = `recap:${guildId}:${week}`;
    if (!(await this.deps.log.claim(claimId, { userId: null, guildId }, now)))
      return "already_posted";
    let keep = false;
    try {
      const members = await this.deps.links.recapMembers(guildId, RECAP_MEMBERS);
      const recap = serverRecap(
        await Promise.all(
          members.map(async (m) => ({
            discordId: m.discordId,
            name: m.globalName ?? m.username,
            games: await this.deps.games(m.accountId32).catch(() => []),
          })),
        ),
        week,
      );
      if (!recap) {
        // A quiet week: nothing to post, and nothing to retry.
        keep = true;
        await this.deps.guilds.markRecapped(guildId, week, now);
        return "no_games";
      }
      const t = this.deps.translator(guild.language ?? "en");
      const heroes = new Map((await this.deps.heroes().catch(() => [])).map((h) => [h.id, h.name]));
      const record = (wins: number, games: number) =>
        t("discord.bot.record", { wins, losses: games - wins });
      const lines = [
        t("discord.bot.weekly.summary", {
          players: plural(t, "discord.bot.weekly.players", recap.players),
          games: plural(t, "discord.bot.weekly.games", recap.games),
          record: record(recap.wins, recap.games),
        }),
        "",
        ...recap.top.map(
          (r, n) => `${n + 1}. **${escapeMarkdown(r.name)}**: ${record(r.wins, r.games)}`,
        ),
      ];
      if (recap.hero)
        lines.push(
          "",
          t("discord.bot.weekly.hero", {
            hero: heroes.get(recap.hero.heroId) ?? `Hero #${recap.hero.heroId}`,
            games: plural(t, "discord.bot.weekly.games", recap.hero.games),
            record: record(recap.hero.wins, recap.hero.games),
          }),
        );
      const message: BotMessage = {
        allowed_mentions: NO_MENTIONS,
        embeds: [
          {
            title: t("discord.bot.weekly.title", { from: week, to: addDays(week, 6) }),
            url: this.deps.appUrl,
            color: BRAND,
            description: lines.join("\n").slice(0, 4000),
            footer: { text: t("discord.bot.weekly.footer") },
          },
        ],
      };
      const out = await this.deps.api.postToChannel(guild.channelId!, message);
      if (out.kind === "ok") {
        keep = true;
        await this.deps.log.markSent(claimId, now);
        await this.deps.guilds.markRecapped(guildId, week, now);
        await this.deps.used?.("discord_recap", guild.userId);
        return "posted";
      }
      if (out.kind === "forbidden") {
        // The channel is gone or the bot lost its permissions: retrying won't help.
        keep = true;
        this.deps.logger.warn("discord_recap_forbidden", { status: out.status });
        return "cant_post";
      }
      throw new Error(`discord recap post failed: ${out.kind}`);
    } finally {
      if (!keep) await this.deps.log.release(claimId).catch(() => {});
    }
  }

  /** Dota Den users who want nudges on Discord (none while the bot can't post). */
  async nudgeUserIds(): Promise<string[]> {
    if (!this.deps.api.canPost) return [];
    return this.deps.links.nudgeUserIds();
  }

  /** Sends one nudge where the member asked; 1 when sent, 0 otherwise. Never throws. */
  async nudge(userId: string, n: DiscordNudge): Promise<number> {
    try {
      if (!this.deps.api.canPost) return 0;
      const link = await this.deps.links.forUser(userId);
      if (!link?.nudges) return 0;
      const guild = link.nudges.guildId ? await this.deps.guilds.get(link.nudges.guildId) : null;
      const target = nudgeTarget(link, guild);
      if (!target) return 0;
      const id = nudgeKey(userId, n.kind, n.occasion);
      const now = this.now();
      if (!(await this.deps.log.claim(id, { userId, guildId: guild?.guildId ?? null }, now)))
        return 0;
      const embed: Record<string, unknown> = {
        title: n.title.slice(0, 256),
        description: n.body.slice(0, 2000),
        url: `${this.deps.appUrl}${n.url}`,
        color: BRAND,
      };
      if (target.kind === "channel") embed.author = { name: link.globalName ?? link.username };
      const message: BotMessage = { allowed_mentions: NO_MENTIONS, embeds: [embed] };
      const out =
        target.kind === "dm"
          ? await this.deps.api.directMessage(target.discordId, message)
          : await this.deps.api.postToChannel(target.channelId, message);
      if (out.kind === "ok") {
        await this.deps.log.markSent(id, now);
        await this.deps.used?.("discord_nudge", userId);
        return 1;
      }
      // DMs closed or the channel gone: don't keep trying this one. Busy: try next time.
      if (out.kind !== "forbidden") await this.deps.log.release(id);
      this.deps.logger.warn("discord_nudge_failed", { kind: n.kind, out });
      return 0;
    } catch (error) {
      this.deps.logger.warn("discord_nudge_failed", { kind: n.kind, error });
      return 0;
    }
  }

  async exportMyData(owner: DataOwner) {
    const [servers, posts] = await Promise.all([
      this.deps.guilds.exportForOwner(owner),
      this.deps.log.exportForOwner(owner),
    ]);
    return { discordServers: servers, discordBotPosts: posts };
  }

  async deleteMyData(owner: DataOwner) {
    const [servers, posts] = await Promise.all([
      this.deps.guilds.deleteForOwner(owner),
      this.deps.log.deleteForOwner(owner),
    ]);
    return { discordServers: servers, discordBotPosts: posts };
  }
}
