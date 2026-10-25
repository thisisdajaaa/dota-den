import type { Logger } from "@/common/logging/logger";
import {
  callerOf,
  CHANNEL_MESSAGE,
  commandOf,
  EPHEMERAL,
  meSummary,
  PING,
  PONG,
  weeklyLeaderboard,
  type BotGame,
  type Interaction,
} from "../domain/bot";
import type { DiscordLinksPort } from "../discord.ports";

/** How many linked members a server leaderboard looks at. */
const LEADERBOARD_MEMBERS = 50;
const BRAND = 0xd4a24a;

export type BotReply = { type: number; data?: Record<string, unknown> };
type Translate = (key: string, vars?: Record<string, string | number>) => string;

/**
 * The Dota Den bot's slash commands (`/den me`, `/den leaderboard`, `/den help`), answered
 * from our own data within Discord's 3 seconds, in the player's Dota Den language. Mentions
 * are switched off in every reply.
 */
export class DiscordBotService {
  constructor(
    private readonly deps: {
      links: DiscordLinksPort;
      games: (accountId32: number) => Promise<BotGame[]>;
      heroName: (heroId: number) => Promise<string>;
      /** A translator in this Dota Den user's language (English for strangers). */
      translator: (userId: string | null) => Promise<Translate>;
      appUrl: string;
      logger: Pick<Logger, "warn">;
      now?: () => Date;
    },
  ) {}

  async handle(i: Interaction): Promise<BotReply> {
    if (i.type === PING) return { type: PONG };
    const caller = callerOf(i);
    const link = caller ? await this.deps.links.forDiscord(caller.id) : null;
    const t = await this.deps.translator(link?.userId ?? null);
    const say = (content: string, ephemeral = false): BotReply => ({
      type: CHANNEL_MESSAGE,
      data: { content, flags: ephemeral ? EPHEMERAL : 0, allowed_mentions: { parse: [] } },
    });
    const command = commandOf(i);
    if (command === "help" || !caller)
      return say(t("discord.bot.help", { url: this.deps.appUrl }), true);
    if (!link) return say(t("discord.bot.notLinked", { url: `${this.deps.appUrl}/account` }), true);
    if (i.guild_id) await this.deps.links.rememberGuild(link.discordId, i.guild_id).catch(() => {});
    const now = this.deps.now?.() ?? new Date();

    if (command === "me") {
      const s = meSummary(await this.deps.games(link.accountId32), now);
      const heroes = await Promise.all(
        s.heroes.map(
          async (h) =>
            `${await this.deps.heroName(h.heroId)}: ${t("discord.bot.record", { wins: h.wins, losses: h.games - h.wins })}`,
        ),
      );
      const name = link.globalName ?? link.username;
      return {
        type: CHANNEL_MESSAGE,
        data: {
          allowed_mentions: { parse: [] },
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
                  value: heroes.length ? heroes.join("\n") : t("discord.bot.noGames"),
                },
              ],
              footer: { text: t("discord.bot.footer") },
            },
          ],
        },
      };
    }

    // Leaderboard: only in a server, among linked members who've used the bot there.
    if (!i.guild_id) return say(t("discord.bot.serverOnly"), true);
    const members = await this.deps.links.inGuild(i.guild_id, LEADERBOARD_MEMBERS);
    const withGames = await Promise.all(
      members.map(async (m) => ({
        discordId: m.discordId,
        name: m.globalName ?? m.username,
        games: await this.deps.games(m.accountId32).catch(() => []),
      })),
    );
    const rows = weeklyLeaderboard(withGames, now);
    if (rows.length === 0) return say(t("discord.bot.boardEmpty"));
    return {
      type: CHANNEL_MESSAGE,
      data: {
        allowed_mentions: { parse: [] },
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
}

/** Discord names are user text: keep them from turning into markdown. */
function escapeMarkdown(s: string): string {
  return s.replace(/([\\*_~`|>[\]()#-])/g, "\\$1");
}
