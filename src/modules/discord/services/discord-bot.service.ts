import type { Logger } from "@/common/logging/logger";
import { clock } from "@/common/utils/grounding";
import {
  APPLICATION_COMMAND,
  AUTOCOMPLETE,
  AUTOCOMPLETE_RESULT,
  BOT_LOCALES,
  botLocale,
  callerOf,
  canManageGuild,
  CHANNEL_MESSAGE,
  clip,
  DEFERRED,
  DEFERRED_CHANNEL_MESSAGE,
  EPHEMERAL,
  escapeMarkdown,
  EXPENSIVE,
  focusedOption,
  meSummary,
  parseCommand,
  PING,
  PLUS_ONLY,
  PONG,
  weeklyLeaderboard,
  type BotCommand,
  type BotLocale,
  type Interaction,
} from "../domain/bot";
import { heroChoices, resolveHero, type BotHero } from "../domain/hero-match";
import type {
  BotCoachFact,
  BotFeatures,
  BotMessage,
  DiscordApiPort,
  DiscordGuildsPort,
  DiscordLink,
  DiscordLinksPort,
  StoredGuild,
} from "../discord.ports";

/** How many linked members a server leaderboard looks at. */
const LEADERBOARD_MEMBERS = 50;
export const BRAND = 0xd4a24a;

export type BotReply = { type: number; data?: Record<string, unknown> };
export type Translate = (key: string, vars?: Record<string, string | number>) => string;

/** A reply now, and for slow commands the work that edits it into the real answer. */
export interface BotOutcome {
  reply: BotReply;
  later?: () => Promise<void>;
}

/** Per Discord user: any command, and the ones that spend AI or upstream budget. */
export const COMMAND_LIMIT = { limit: 20, windowMs: 60_000 };
export const EXPENSIVE_LIMIT = { limit: 5, windowMs: 10 * 60_000 };

const NO_MENTIONS = { parse: [] as string[] };
const LANGUAGE_NAMES: Record<BotLocale, string> = {
  en: "English",
  fil: "Filipino",
  ceb: "Cebuano",
};

export const plural = (
  t: Translate,
  key: string,
  n: number,
  vars?: Record<string, string | number>,
) => t(`${key}.${n === 1 ? "one" : "other"}`, { ...vars, n });

/**
 * The Dota Den bot's slash commands, over Discord's HTTP interactions. Quick commands answer
 * within Discord's 3 seconds; AI and slow ones answer "thinking…" and edit it with the real
 * answer once ready. Replies are in the player's Dota Den language, mentions are switched off
 * everywhere, and Plus commands reuse the site's services (same quotas, budgets and checks).
 */
export class DiscordBotService {
  constructor(
    private readonly deps: {
      links: DiscordLinksPort;
      guilds: DiscordGuildsPort;
      features: BotFeatures;
      api: DiscordApiPort;
      translator: (locale: BotLocale) => Translate;
      /** Shared rate limiter: true when the call may go ahead. */
      limit: (key: string, limit: number, windowMs: number) => Promise<boolean>;
      appUrl: string;
      /** Counts a use (admin usage numbers); never fails. */
      used?: (userId: string) => Promise<void>;
      logger: Pick<Logger, "warn" | "info">;
      now?: () => Date;
    },
  ) {}

  private now() {
    return this.deps.now?.() ?? new Date();
  }

  async handle(i: Interaction): Promise<BotOutcome> {
    if (i.type === PING) return { reply: { type: PONG } };
    if (i.type === AUTOCOMPLETE) return { reply: await this.autocomplete(i) };
    const caller = callerOf(i);
    const command = parseCommand(i);
    const link = caller ? await this.deps.links.forDiscord(caller.id) : null;
    const guild = i.guild_id ? await this.deps.guilds.get(i.guild_id).catch(() => null) : null;
    const userLanguage = link
      ? await this.deps.features.userLanguage(link.userId).catch(() => null)
      : null;
    const locale = botLocale({ userLanguage, guildLanguage: guild?.language });
    const t = this.deps.translator(locale);
    const say = (content: string, ephemeral = true): BotReply => ({
      type: CHANNEL_MESSAGE,
      data: { content, flags: ephemeral ? EPHEMERAL : 0, allowed_mentions: NO_MENTIONS },
    });
    const url = this.deps.appUrl;

    if (i.type !== APPLICATION_COMMAND || !caller || command.name === "help")
      return { reply: say(t("discord.bot.help", { url })) };
    if (!link) return { reply: say(t("discord.bot.notLinked", { url: `${url}/account` })) };

    const { limit, windowMs } = EXPENSIVE.has(command.name) ? EXPENSIVE_LIMIT : COMMAND_LIMIT;
    const scope = EXPENSIVE.has(command.name) ? "ai" : "cmd";
    if (!(await this.deps.limit(`discord:${scope}:${caller.id}`, limit, windowMs)))
      return { reply: say(t("discord.bot.slowDown")) };

    if (i.guild_id) await this.deps.links.rememberGuild(link.discordId, i.guild_id).catch(() => {});
    if (PLUS_ONLY.has(command.name) && !(await this.deps.features.isPlus(link.userId)))
      return { reply: say(t("discord.bot.plusOnly", { url: `${url}/plus` })) };
    await this.deps.used?.(link.userId);

    if (DEFERRED.has(command.name)) {
      if (!i.application_id || !i.token) return { reply: say(t("discord.bot.error")) };
      const appId = i.application_id;
      const token = i.token;
      const share = "share" in command ? command.share : false;
      return {
        reply: { type: DEFERRED_CHANNEL_MESSAGE, data: { flags: share ? 0 : EPHEMERAL } },
        later: async () => {
          let message: BotMessage;
          try {
            message = await this.slow(command, { i, link, guild, locale, t });
          } catch (error) {
            this.deps.logger.warn("discord_command_failed", { command: command.name, error });
            message = { content: t("discord.bot.error"), allowed_mentions: NO_MENTIONS };
          }
          const out = await this.deps.api.editOriginal(appId, token, message);
          if (out.kind !== "ok")
            this.deps.logger.warn("discord_followup_failed", { command: command.name, out });
        },
      };
    }
    return { reply: await this.quick(command, { i, link, guild, locale, t, say }) };
  }

  /** Hero suggestions while typing `enemy1`…`ally4` (no account needed: only hero names). */
  private async autocomplete(i: Interaction): Promise<BotReply> {
    const focused = focusedOption(i);
    if (!focused || !/^(enemy|ally)\d$/.test(focused.name))
      return { type: AUTOCOMPLETE_RESULT, data: { choices: [] } };
    const heroes = await this.deps.features.heroes().catch(() => []);
    return {
      type: AUTOCOMPLETE_RESULT,
      data: {
        choices: heroChoices(focused.value, heroes).map((h) => ({
          name: h.name.slice(0, 100),
          value: String(h.id),
        })),
      },
    };
  }

  private async quick(
    command: BotCommand,
    ctx: {
      i: Interaction;
      link: DiscordLink;
      guild: StoredGuild | null;
      locale: BotLocale;
      t: Translate;
      say: (content: string, ephemeral?: boolean) => BotReply;
    },
  ): Promise<BotReply> {
    const { i, link, t, say } = ctx;
    switch (command.name) {
      case "me":
        return { type: CHANNEL_MESSAGE, data: await this.me(link, t) };
      case "leaderboard":
        return this.leaderboard(i, t, say);
      case "lang": {
        if (!command.language)
          return say(
            t("discord.bot.langCurrent", {
              language: LANGUAGE_NAMES[ctx.locale],
              choices: BOT_LOCALES.join(", "),
            }),
          );
        await this.deps.features.setLanguage(link.userId, command.language);
        // Confirmed in the new language.
        return say(
          this.deps.translator(command.language)("discord.bot.langSet", {
            language: LANGUAGE_NAMES[command.language],
          }),
        );
      }
      case "recap":
        return this.recap(command.on, i, link, ctx.guild, t, say);
      case "nudges":
        return this.nudges(command.where, i, link, ctx.guild, t, say);
      default:
        return say(t("discord.bot.help", { url: this.deps.appUrl }));
    }
  }

  private async slow(
    command: BotCommand,
    ctx: {
      i: Interaction;
      link: DiscordLink;
      guild: StoredGuild | null;
      locale: BotLocale;
      t: Translate;
    },
  ): Promise<BotMessage> {
    const { link, locale, t } = ctx;
    const user = { id: link.userId, accountId32: link.accountId32 };
    const text = (content: string): BotMessage => ({ content, allowed_mentions: NO_MENTIONS });
    const url = this.deps.appUrl;
    switch (command.name) {
      case "coach": {
        const res = await this.deps.features.coach(user, command.matchId, locale);
        if (res.kind !== "review") {
          const vars = {
            url: res.kind === "unparsed" ? `${url}/matches/${res.matchId}` : `${url}/plus`,
          };
          return text(t(`discord.bot.coach.${res.kind}`, vars));
        }
        const heroes = await this.heroNames();
        return {
          allowed_mentions: NO_MENTIONS,
          embeds: [
            {
              title: t("discord.bot.coach.title", { hero: heroes(res.heroId) }),
              url: `${url}/matches/${res.matchId}`,
              color: BRAND,
              fields: res.points.slice(0, 5).map((p) => ({
                name: clip(`${t(`discord.bot.coach.${p.kind}`)} · ${p.title}`, 256),
                value: clip(
                  [
                    p.detail,
                    p.facts.map((f) => `${factName(t, f)}: ${factValue(t, f)}`).join(" · "),
                  ]
                    .filter(Boolean)
                    .join("\n"),
                  1024,
                ),
              })),
              footer: { text: t("discord.bot.coach.footer") },
            },
          ],
        };
      }
      case "ask": {
        const res = await this.deps.features.ask(user, command.question, locale);
        if (res.kind !== "answer")
          return text(
            t(`discord.bot.ask.${res.kind}`, {
              url: `${url}/ask`,
              ...(res.kind === "quota" ? { resetsAt: res.resetsAt } : {}),
            }),
          );
        const footer = t("discord.bot.ask.footer", { remaining: res.remaining, limit: res.limit });
        return {
          allowed_mentions: NO_MENTIONS,
          content: clip(
            `> ${escapeMarkdown(command.question).slice(0, 300)}\n\n${res.text}\n\n-# ${footer}`,
            2000,
          ),
        };
      }
      case "pick":
        return this.pick(command, user, t);
      case "setup":
        return this.setup(command, ctx);
      default:
        return text(t("discord.bot.help", { url }));
    }
  }

  private async heroNames(): Promise<(id: number) => string> {
    const heroes = await this.deps.features.heroes().catch(() => [] as BotHero[]);
    const byId = new Map(heroes.map((h) => [h.id, h.name]));
    return (id) => byId.get(id) ?? `Hero #${id}`;
  }

  private async me(link: DiscordLink, t: Translate): Promise<Record<string, unknown>> {
    const s = meSummary(await this.deps.features.games(link.accountId32), this.now());
    const hero = await this.heroNames();
    const name = link.globalName ?? link.username;
    return {
      allowed_mentions: NO_MENTIONS,
      embeds: [
        {
          title: t("discord.bot.meTitle", { name }),
          url: `${this.deps.appUrl}/players/${link.accountId32}`,
          color: BRAND,
          fields: [
            {
              name: t("discord.bot.week"),
              value: s.week.games
                ? t("discord.bot.weekValue", {
                    wins: s.week.wins,
                    losses: s.week.games - s.week.wins,
                    rate: Math.round((s.week.wins / s.week.games) * 100),
                  })
                : t("discord.bot.noGames"),
              inline: true,
            },
            { name: t("discord.bot.form"), value: s.form || "–", inline: true },
            {
              name: t("discord.bot.heroes"),
              value: s.heroes.length
                ? s.heroes
                    .map(
                      (h) =>
                        `${hero(h.heroId)}: ${t("discord.bot.record", { wins: h.wins, losses: h.games - h.wins })}`,
                    )
                    .join("\n")
                : t("discord.bot.noGames"),
            },
          ],
          footer: { text: t("discord.bot.footer") },
        },
      ],
    };
  }

  private async leaderboard(
    i: Interaction,
    t: Translate,
    say: (content: string, ephemeral?: boolean) => BotReply,
  ): Promise<BotReply> {
    // Only in a server, among linked members who've used the bot there.
    if (!i.guild_id) return say(t("discord.bot.serverOnly"));
    const members = await this.deps.links.inGuild(i.guild_id, LEADERBOARD_MEMBERS);
    const withGames = await Promise.all(
      members.map(async (m) => ({
        discordId: m.discordId,
        name: m.globalName ?? m.username,
        games: await this.deps.features.games(m.accountId32).catch(() => []),
      })),
    );
    const rows = weeklyLeaderboard(withGames, this.now());
    if (rows.length === 0) return say(t("discord.bot.boardEmpty"), false);
    return {
      type: CHANNEL_MESSAGE,
      data: {
        allowed_mentions: NO_MENTIONS,
        embeds: [
          {
            title: t("discord.bot.boardTitle"),
            color: BRAND,
            description: rows
              .map(
                (r, n) =>
                  `${n + 1}. **${escapeMarkdown(r.name)}**: ${t("discord.bot.record", { wins: r.wins, losses: r.games - r.wins })}`,
              )
              .join("\n"),
            footer: { text: t("discord.bot.boardFooter") },
          },
        ],
      },
    };
  }

  private async recap(
    on: boolean | null,
    i: Interaction,
    link: DiscordLink,
    guild: StoredGuild | null,
    t: Translate,
    say: (content: string, ephemeral?: boolean) => BotReply,
  ): Promise<BotReply> {
    if (!i.guild_id) return say(t("discord.bot.serverOnly"));
    const serverOn = guild?.recap === true && guild.channelId !== null;
    const note = serverOn ? "" : `\n${t("discord.bot.recap.serverOff")}`;
    if (on === null) {
      const mine = link.recapGuilds.includes(i.guild_id);
      return say(t(mine ? "discord.bot.recap.statusOn" : "discord.bot.recap.statusOff") + note);
    }
    await this.deps.links.setRecap(link.discordId, i.guild_id, on);
    return say(t(on ? "discord.bot.recap.on" : "discord.bot.recap.off") + (on ? note : ""));
  }

  private async nudges(
    where: "off" | "dm" | "server" | null,
    i: Interaction,
    link: DiscordLink,
    guild: StoredGuild | null,
    t: Translate,
    say: (content: string, ephemeral?: boolean) => BotReply,
  ): Promise<BotReply> {
    const url = `${this.deps.appUrl}/account`;
    if (where === null) {
      const n = link.nudges;
      const key = !n ? "statusOff" : n.where === "dm" ? "statusDm" : "statusServer";
      return say(t(`discord.bot.nudges.${key}`, { url }));
    }
    if (!this.deps.api.canPost) return say(t("discord.bot.nudges.unavailable"));
    if (where === "off") {
      await this.deps.links.setNudges(link.userId, null);
      return say(t("discord.bot.nudges.off"));
    }
    if (where === "dm") {
      await this.deps.links.setNudges(link.userId, { where: "dm", guildId: null });
      return say(t("discord.bot.nudges.dm", { url }));
    }
    if (!i.guild_id) return say(t("discord.bot.serverOnly"));
    if (!guild?.nudges || !guild.channelId) return say(t("discord.bot.nudges.serverOff"));
    await this.deps.links.setNudges(link.userId, { where: "server", guildId: i.guild_id });
    return say(t("discord.bot.nudges.server", { channel: `<#${guild.channelId}>`, url }));
  }

  private async pick(
    command: Extract<BotCommand, { name: "pick" }>,
    user: { id: string; accountId32: number },
    t: Translate,
  ): Promise<BotMessage> {
    const heroes = await this.deps.features.heroes();
    const unknown: string[] = [];
    const resolve = (values: string[]) =>
      values.flatMap((v) => {
        const r = resolveHero(v, heroes);
        if (r.ok) return [r.hero.id];
        unknown.push(r.input);
        return [];
      });
    const enemies = [...new Set(resolve(command.enemies))];
    const allies = [...new Set(resolve(command.allies))];
    if (unknown.length)
      return {
        allowed_mentions: NO_MENTIONS,
        content: t("discord.bot.pick.unknown", {
          names: unknown.map((n) => `"${escapeMarkdown(n)}"`).join(", "),
        }),
      };
    const res = await this.deps.features.pick(user, {
      enemies,
      allies,
      position: command.position,
    });
    if (res.kind === "failed")
      return { allowed_mentions: NO_MENTIONS, content: t("discord.bot.pick.failed") };
    if (res.suggestions.length === 0)
      return {
        allowed_mentions: NO_MENTIONS,
        content: t("discord.bot.pick.none", { url: `${this.deps.appUrl}/draft/pick` }),
      };
    const name = (id: number) => heroes.find((h) => h.id === id)?.name ?? `Hero #${id}`;
    const signed = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}`;
    const lines = res.suggestions.map((s, n) => {
      const parts = [
        t("discord.bot.pick.you", {
          wins: s.you.wins,
          losses: s.you.games - s.you.wins,
          games: s.you.games,
        }),
        ...s.counters.map((c) =>
          t("discord.bot.pick.vs", {
            hero: name(c.heroId),
            points: signed(c.points),
            games: c.games.toLocaleString("en-US"),
          }),
        ),
        ...s.allies.map((c) =>
          t("discord.bot.pick.with", {
            hero: name(c.heroId),
            points: signed(c.points),
            games: c.games.toLocaleString("en-US"),
          }),
        ),
      ];
      return `${n + 1}. **${name(s.heroId)}**: ${parts.join(" · ")}`;
    });
    const against = enemies.length
      ? t("discord.bot.pick.against", { heroes: enemies.map(name).join(", ") })
      : t("discord.bot.pick.noEnemies");
    return {
      allowed_mentions: NO_MENTIONS,
      embeds: [
        {
          title: t("discord.bot.pick.title"),
          url: `${this.deps.appUrl}/draft/pick`,
          color: BRAND,
          description: clip(`${against}\n\n${lines.join("\n")}`, 4000),
          footer: {
            text: t(res.highRank ? "discord.bot.pick.footer" : "discord.bot.pick.footerOwn"),
          },
        },
      ],
    };
  }

  /** `/den setup`: a server admin picks the bot channel, the Monday recap and nudges. */
  private async setup(
    command: Extract<BotCommand, { name: "setup" }>,
    ctx: { i: Interaction; link: DiscordLink; guild: StoredGuild | null; t: Translate },
  ): Promise<BotMessage> {
    const { i, link, guild, t } = ctx;
    const text = (content: string): BotMessage => ({ content, allowed_mentions: NO_MENTIONS });
    if (!i.guild_id) return text(t("discord.bot.serverOnly"));
    if (!canManageGuild(i.member?.permissions)) return text(t("discord.bot.setup.notAdmin"));
    if (!this.deps.api.canPost) return text(t("discord.bot.setup.unavailable"));
    const turningOnRecap = command.recap === true && guild?.recap !== true;
    if (turningOnRecap && !(await this.deps.features.isPlus(link.userId)))
      return text(t("discord.bot.setup.recapPlus", { url: `${this.deps.appUrl}/plus` }));
    const next = {
      guildId: i.guild_id,
      channelId: command.channelId ?? guild?.channelId ?? i.channel_id ?? null,
      recap: command.recap ?? guild?.recap ?? false,
      nudges: command.nudges ?? guild?.nudges ?? false,
      language: command.language ?? guild?.language ?? null,
      // The recap is the Plus of whoever turned it on; changing other settings keeps it theirs.
      userId: turningOnRecap || !guild ? link.userId : guild.userId,
      setupByDiscordId: turningOnRecap || !guild ? link.discordId : guild.setupByDiscordId,
    };
    if (!next.channelId) return text(t("discord.bot.setup.noChannel"));
    const lt = this.deps.translator(next.language ?? "en");
    if (next.recap || next.nudges) {
      // Check the bot can post there now, rather than fail silently on Monday.
      const posted = await this.deps.api.postToChannel(next.channelId, {
        allowed_mentions: NO_MENTIONS,
        content: lt("discord.bot.setup.hello", { url: this.deps.appUrl }),
      });
      if (posted.kind !== "ok")
        return text(t("discord.bot.setup.cantPost", { channel: `<#${next.channelId}>` }));
    }
    await this.deps.guilds.save(next, this.now());
    this.deps.logger.info("discord_guild_setup", {
      recap: next.recap,
      nudges: next.nudges,
      language: next.language,
    });
    const yes = t("discord.bot.setup.yes");
    const no = t("discord.bot.setup.no");
    return text(
      t("discord.bot.setup.saved", {
        channel: `<#${next.channelId}>`,
        recap: next.recap ? yes : no,
        nudges: next.nudges ? yes : no,
        language: LANGUAGE_NAMES[next.language ?? "en"],
      }),
    );
  }
}

const VALUE_CODES = new Set([
  "win",
  "loss",
  "solo",
  "party",
  "unknown",
  "safe",
  "mid",
  "off",
  "jungle",
  "roaming",
  "won",
  "even",
  "lost",
]);

/** A coach fact's label, as the match page words it. */
function factName(t: Translate, f: BotCoachFact): string {
  const subject =
    f.base === "benchmark" && f.subject
      ? t(`matches.performance.stats.${f.subject}`)
      : (f.subject ?? "");
  return t(`matches.coach.facts.${f.base}`, { subject });
}

/** A coach fact's value from our stored sheet (never the model's text). */
function factValue(t: Translate, f: BotCoachFact): string {
  if (typeof f.value === "string")
    return VALUE_CODES.has(f.value) ? t(`matches.coach.values.${f.value}`) : f.value;
  switch (f.unit) {
    case "clock":
      return clock(f.value);
    case "percent":
      return `${f.value}%`;
    case "seconds":
      return `${f.value}s`;
    case "ratio":
      return f.value.toFixed(1);
    default:
      return f.value.toLocaleString("en-US");
  }
}
