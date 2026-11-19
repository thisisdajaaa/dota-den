/**
 * The Dota Den Discord bot (pure): what an interaction asks for, who may do what, and the
 * numbers each slash command shows. Only a player's own match results (public Steam data they
 * imported); never their MMR journal, which is private.
 */
import { z } from "zod";
import type { Position } from "@/modules/drafts/domain/pick-for-me";

/** Discord interaction types we handle (discord.com/developers/docs/interactions). */
export const PING = 1;
export const APPLICATION_COMMAND = 2;
export const AUTOCOMPLETE = 4;
/** Response types. */
export const PONG = 1;
export const CHANNEL_MESSAGE = 4;
/** "Thinking…": the real answer follows by editing the original response (15 minutes). */
export const DEFERRED_CHANNEL_MESSAGE = 5;
export const AUTOCOMPLETE_RESULT = 8;
/** Message flag: only the person who ran the command sees it. */
export const EPHEMERAL = 64;

/** Application command option types. */
export const OPTION = { SUB_COMMAND: 1, STRING: 3, INTEGER: 4, BOOLEAN: 5, CHANNEL: 7 } as const;

/** Languages the bot speaks (the site's languages). */
export const BOT_LOCALES = ["en", "fil", "ceb"] as const;
export type BotLocale = (typeof BOT_LOCALES)[number];
export const isBotLocale = (v: unknown): v is BotLocale =>
  typeof v === "string" && (BOT_LOCALES as readonly string[]).includes(v);

const Snowflake = z.string().regex(/^\d{15,25}$/);

const DiscordUser = z.object({
  id: Snowflake,
  username: z.string(),
  global_name: z.string().nullable().optional(),
});

const LeafOption = z.object({
  name: z.string().max(32),
  type: z.number().int(),
  value: z.union([z.string().max(600), z.number(), z.boolean()]).optional(),
  focused: z.boolean().optional(),
});

const SubOption = z.object({
  name: z.string().max(32),
  type: z.number().int(),
  value: z.union([z.string().max(600), z.number(), z.boolean()]).optional(),
  options: z.array(LeafOption).max(25).optional(),
});

export const InteractionSchema = z.object({
  type: z.number().int(),
  id: Snowflake.optional(),
  application_id: Snowflake.optional(),
  /** The interaction token: answers the interaction for 15 minutes (a secret; never logged). */
  token: z.string().max(500).optional(),
  guild_id: Snowflake.optional(),
  channel_id: Snowflake.optional(),
  /** The member's permissions in this channel (a bitfield, as a decimal string). */
  member: z.object({ user: DiscordUser, permissions: z.string().max(30).optional() }).optional(),
  user: DiscordUser.optional(),
  locale: z.string().max(10).optional(),
  data: z
    .object({
      name: z.string(),
      options: z.array(SubOption).max(25).optional(),
    })
    .optional(),
});
export type Interaction = z.infer<typeof InteractionSchema>;

export type NudgeWhere = "off" | "dm" | "server";

/** A `/den <subcommand>` with its options, read and checked. */
export type BotCommand =
  | { name: "help" }
  | { name: "me" }
  | { name: "leaderboard" }
  | { name: "lang"; language: BotLocale | null }
  | { name: "coach"; matchId: string | null; share: boolean }
  | { name: "ask"; question: string; share: boolean }
  | {
      name: "pick";
      /** Hero ids, or what the player typed when it wasn't picked from the list. */
      enemies: string[];
      allies: string[];
      position: Position | null;
      share: boolean;
    }
  | {
      name: "setup";
      channelId: string | null;
      recap: boolean | null;
      nudges: boolean | null;
      language: BotLocale | null;
    }
  | { name: "recap"; on: boolean | null }
  | { name: "nudges"; where: NudgeWhere | null };

export type BotCommandName = BotCommand["name"];

/** Commands that answer from AI or slow sources: "thinking…" first, then the answer. */
export const DEFERRED: ReadonlySet<BotCommandName> = new Set(["coach", "ask", "pick", "setup"]);
/** Commands for Dota Den Plus members (the free ones stay free). */
export const PLUS_ONLY: ReadonlySet<BotCommandName> = new Set(["coach", "ask", "pick"]);
/** Commands that spend AI or upstream budget: a tighter per-person rate limit. */
export const EXPENSIVE: ReadonlySet<BotCommandName> = new Set(["coach", "ask", "pick"]);

export const MAX_PICK_HEROES = 5;
export const MAX_QUESTION_CHARS = 500;

type Leaf = z.infer<typeof LeafOption>;

const str = (opts: readonly Leaf[], name: string): string | null => {
  const v = opts.find((o) => o.name === name)?.value;
  return typeof v === "string" && v.trim() ? v.trim() : null;
};
const bool = (opts: readonly Leaf[], name: string): boolean | null => {
  const v = opts.find((o) => o.name === name)?.value;
  return typeof v === "boolean" ? v : null;
};
const int = (opts: readonly Leaf[], name: string): number | null => {
  const v = opts.find((o) => o.name === name)?.value;
  return typeof v === "number" && Number.isInteger(v) ? v : null;
};

/** The heroes in numbered options (`enemy1`…`enemy5`), in order, without blanks. */
function heroList(opts: readonly Leaf[], prefix: string, max: number): string[] {
  const out: string[] = [];
  for (let n = 1; n <= max; n++) {
    const v = str(opts, `${prefix}${n}`);
    if (v) out.push(v.slice(0, 40));
  }
  return out;
}

/** The `/den <subcommand>` asked for, with its options; "help" for anything else. */
export function parseCommand(i: Interaction): BotCommand {
  if (i.data?.name !== "den") return { name: "help" };
  const sub = i.data.options?.[0];
  const opts = sub?.options ?? [];
  switch (sub?.name) {
    case "me":
    case "leaderboard":
      return { name: sub.name };
    case "lang": {
      const language = str(opts, "language");
      return { name: "lang", language: isBotLocale(language) ? language : null };
    }
    case "coach": {
      const match = str(opts, "match");
      return {
        name: "coach",
        matchId: match && /^\d{1,20}$/.test(match) ? match : null,
        share: bool(opts, "share") ?? false,
      };
    }
    case "ask": {
      const question = str(opts, "question");
      if (!question) return { name: "help" };
      return {
        name: "ask",
        question: question.slice(0, MAX_QUESTION_CHARS),
        share: bool(opts, "share") ?? false,
      };
    }
    case "pick": {
      const position = int(opts, "position");
      return {
        name: "pick",
        enemies: heroList(opts, "enemy", MAX_PICK_HEROES),
        allies: heroList(opts, "ally", MAX_PICK_HEROES - 1),
        position:
          position !== null && position >= 1 && position <= 5 ? (position as Position) : null,
        share: bool(opts, "share") ?? false,
      };
    }
    case "setup": {
      const channel = str(opts, "channel");
      const language = str(opts, "language");
      return {
        name: "setup",
        channelId: channel && /^\d{15,25}$/.test(channel) ? channel : null,
        recap: bool(opts, "recap"),
        nudges: bool(opts, "nudges"),
        language: isBotLocale(language) ? language : null,
      };
    }
    case "recap":
      return { name: "recap", on: bool(opts, "on") };
    case "nudges": {
      const where = str(opts, "where");
      return {
        name: "nudges",
        where: where === "off" || where === "dm" || where === "server" ? where : null,
      };
    }
    default:
      return { name: "help" };
  }
}

/** The option being typed in an autocomplete interaction, if any. */
export function focusedOption(i: Interaction): { name: string; value: string } | null {
  const sub = i.data?.options?.[0];
  const o = sub?.options?.find((x) => x.focused);
  if (!o) return null;
  return { name: o.name, value: typeof o.value === "string" ? o.value : String(o.value ?? "") };
}

/** Who ran it (in a server: the member; in a DM: the user). */
export function callerOf(i: Interaction) {
  return i.member?.user ?? i.user ?? null;
}

const ADMINISTRATOR = 1n << 3n;
const MANAGE_GUILD = 1n << 5n;

/**
 * Whether the member may set the bot up for the server: Manage Server or Administrator, from
 * the permissions Discord sends with the interaction (signed, so it can't be forged).
 */
export function canManageGuild(permissions: string | undefined): boolean {
  if (!permissions || !/^\d{1,30}$/.test(permissions)) return false;
  const p = BigInt(permissions);
  return (p & ADMINISTRATOR) !== 0n || (p & MANAGE_GUILD) !== 0n;
}

/**
 * The bot's language for a reply: the player's Dota Den language when they linked and chose
 * one, else the server's (set by `/den setup`), else English. Discord has no Filipino or
 * Cebuano client language, so its own locale never picks them.
 */
export function botLocale(input: {
  userLanguage: string | null | undefined;
  guildLanguage: string | null | undefined;
}): BotLocale {
  if (isBotLocale(input.userLanguage)) return input.userLanguage;
  if (isBotLocale(input.guildLanguage)) return input.guildLanguage;
  return "en";
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
  return {
    week: { games: week.length, wins: week.filter((g) => g.won).length },
    form: sorted
      .slice(0, 10)
      .map((g) => (g.won ? "W" : "L"))
      .join(""),
    heroes: heroTally(month).slice(0, 3),
  };
}

/** Games and wins per hero, most played first (ties: more wins). */
export function heroTally(
  games: readonly BotGame[],
): { heroId: number; games: number; wins: number }[] {
  const byHero = new Map<number, { heroId: number; games: number; wins: number }>();
  for (const g of games) {
    const h = byHero.get(g.heroId) ?? { heroId: g.heroId, games: 0, wins: 0 };
    h.games++;
    if (g.won) h.wins++;
    byHero.set(g.heroId, h);
  }
  return [...byHero.values()].sort(
    (a, b) => b.games - a.games || b.wins - a.wins || a.heroId - b.heroId,
  );
}

export interface LeaderboardRow {
  discordId: string;
  name: string;
  games: number;
  wins: number;
}

/** Ranked wins among members, most wins first (ties: fewer games, then name). */
export function rankMembers(
  members: readonly { discordId: string; name: string; games: readonly BotGame[] }[],
  include: (g: BotGame) => boolean,
  limit = 10,
): LeaderboardRow[] {
  return members
    .map((m) => {
      const kept = m.games.filter((g) => g.ranked && include(g));
      return {
        discordId: m.discordId,
        name: m.name,
        games: kept.length,
        wins: kept.filter((g) => g.won).length,
      };
    })
    .filter((r) => r.games > 0)
    .sort((a, b) => b.wins - a.wins || a.games - b.games || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** `/den leaderboard`: ranked wins in the last 7 days. */
export function weeklyLeaderboard(
  members: readonly { discordId: string; name: string; games: readonly BotGame[] }[],
  now: Date,
  limit = 10,
): LeaderboardRow[] {
  return rankMembers(members, (g) => now.getTime() - g.startedAt.getTime() <= 7 * DAY, limit);
}

/** Discord names are user text: keep them from turning into markdown. */
export function escapeMarkdown(s: string): string {
  return s.replace(/([\\*_~`|>[\]()#-])/g, "\\$1");
}

/** Text cut to Discord's limits (at a line end when there is one). */
export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = text.slice(0, max - 1);
  const end = head.lastIndexOf("\n");
  return `${end > max / 2 ? head.slice(0, end) : head}…`;
}
