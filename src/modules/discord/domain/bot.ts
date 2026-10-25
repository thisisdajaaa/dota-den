/**
 * The Dota Den Discord bot (pure): what an interaction asks for, and the numbers each slash
 * command shows. Only a player's own match results (public Steam data they imported); never
 * their MMR journal, which is private.
 */
import { z } from "zod";

/** Discord interaction types we handle (discord.com/developers/docs/interactions). */
export const PING = 1;
export const APPLICATION_COMMAND = 2;
/** Response types. */
export const PONG = 1;
export const CHANNEL_MESSAGE = 4;
/** Message flag: only the person who ran the command sees it. */
export const EPHEMERAL = 64;

const DiscordUser = z.object({
  id: z.string().regex(/^\d{15,25}$/),
  username: z.string(),
  global_name: z.string().nullable().optional(),
});

export const InteractionSchema = z.object({
  type: z.number().int(),
  guild_id: z
    .string()
    .regex(/^\d{15,25}$/)
    .optional(),
  member: z.object({ user: DiscordUser }).optional(),
  user: DiscordUser.optional(),
  data: z
    .object({
      name: z.string(),
      options: z.array(z.object({ name: z.string(), type: z.number().int() })).optional(),
    })
    .optional(),
});
export type Interaction = z.infer<typeof InteractionSchema>;

export type BotCommand = "me" | "leaderboard" | "help";

/** The `/den <subcommand>` asked for; "help" for anything else. */
export function commandOf(i: Interaction): BotCommand {
  if (i.data?.name !== "den") return "help";
  const sub = i.data.options?.[0]?.name;
  return sub === "me" || sub === "leaderboard" ? sub : "help";
}

/** Who ran it (in a server: the member; in a DM: the user). */
export function callerOf(i: Interaction) {
  return i.member?.user ?? i.user ?? null;
}

export interface BotGame {
  heroId: number;
  startedAt: Date;
  won: boolean;
  ranked: boolean;
}

const DAY = 24 * 3_600_000;

export interface MeSummary {
  week: { games: number; wins: number };
  /** Newest first: "W" or "L" for the last ten games. */
  form: string;
  /** Most played heroes in the last 30 days. */
  heroes: { heroId: number; games: number; wins: number }[];
}

/** `/den me`: the last week, recent form and most played heroes. */
export function meSummary(games: readonly BotGame[], now: Date): MeSummary {
  const sorted = [...games].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  const week = sorted.filter((g) => now.getTime() - g.startedAt.getTime() <= 7 * DAY);
  const month = sorted.filter((g) => now.getTime() - g.startedAt.getTime() <= 30 * DAY);
  const byHero = new Map<number, { heroId: number; games: number; wins: number }>();
  for (const g of month) {
    const h = byHero.get(g.heroId) ?? { heroId: g.heroId, games: 0, wins: 0 };
    h.games++;
    if (g.won) h.wins++;
    byHero.set(g.heroId, h);
  }
  return {
    week: { games: week.length, wins: week.filter((g) => g.won).length },
    form: sorted
      .slice(0, 10)
      .map((g) => (g.won ? "W" : "L"))
      .join(""),
    heroes: [...byHero.values()].sort((a, b) => b.games - a.games || b.wins - a.wins).slice(0, 3),
  };
}

export interface LeaderboardRow {
  discordId: string;
  name: string;
  games: number;
  wins: number;
}

/** `/den leaderboard`: ranked wins in the last 7 days, most wins first (ties: fewer games). */
export function weeklyLeaderboard(
  members: readonly { discordId: string; name: string; games: readonly BotGame[] }[],
  now: Date,
  limit = 10,
): LeaderboardRow[] {
  return members
    .map((m) => {
      const week = m.games.filter(
        (g) => g.ranked && now.getTime() - g.startedAt.getTime() <= 7 * DAY,
      );
      return {
        discordId: m.discordId,
        name: m.name,
        games: week.length,
        wins: week.filter((g) => g.won).length,
      };
    })
    .filter((r) => r.games > 0)
    .sort((a, b) => b.wins - a.wins || a.games - b.games || a.name.localeCompare(b.name))
    .slice(0, limit);
}
