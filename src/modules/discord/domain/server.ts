/**
 * Server features of the bot (pure): the Monday recap posted to a channel a server admin
 * chose, and the tilt / stop-loss nudges a member can ask for. Nobody's games are posted
 * unless they linked their account and turned the recap on in that server; nudges go where
 * the member asked (a DM, or the server's bot channel) and only for limits they set.
 */
import { addDays, dayKeyFormatter, type DayKey } from "@/common/time/day-key";
import {
  COACH_TIME_ZONE,
  isFinishedCoachWeek,
  isQStashSafe,
  lastCoachWeek,
} from "@/modules/report/domain/weekly-coach";
import { heroTally, rankMembers, type BotGame, type LeaderboardRow, type NudgeWhere } from "./bot";

/** Recap weeks are the weekly coach's: Monday to Sunday, Philippine time. */
export const RECAP_TIME_ZONE = COACH_TIME_ZONE;
/** The last finished week, as its Monday. */
export const lastRecapWeek = (now: Date): DayKey => lastCoachWeek(now);
export const isFinishedRecapWeek = isFinishedCoachWeek;

/** How many members a recap lists by name. */
export const RECAP_TOP = 5;
/** Members a recap reads at most (a friends' server, not a big community). */
export const RECAP_MEMBERS = 100;

export interface RecapMember {
  discordId: string;
  name: string;
  games: readonly BotGame[];
}

export interface ServerRecap {
  week: DayKey;
  /** Members (opted in) with at least one ranked game that week. */
  players: number;
  games: number;
  wins: number;
  top: LeaderboardRow[];
  /** The server's most played hero that week, with its record. */
  hero: { heroId: number; games: number; wins: number } | null;
}

const manilaDay = dayKeyFormatter(RECAP_TIME_ZONE);

/** Ranked games of the week (Monday `week` to Sunday, Manila days) of the opted-in members. */
export function serverRecap(members: readonly RecapMember[], week: DayKey): ServerRecap | null {
  const end = addDays(week, 6);
  const inWeek = (g: BotGame) => {
    const day = manilaDay(g.startedAt);
    return g.ranked && day >= week && day <= end;
  };
  const games = members.flatMap((m) => m.games.filter(inWeek));
  if (games.length === 0) return null;
  const all = rankMembers(members, inWeek, members.length);
  return {
    week,
    players: all.length,
    games: games.length,
    wins: games.filter((g) => g.won).length,
    top: all.slice(0, RECAP_TOP),
    hero: heroTally(games)[0] ?? null,
  };
}

/** The per-server recap job's dedup key (letters, digits and '-' only: QStash-safe). */
export function recapJobKey(guildId: string, week: DayKey): string {
  const key = `discord-recap-${guildId}-${week}`;
  if (!isQStashSafe(key)) throw new Error("discord recap job key must be QStash-safe");
  return key;
}

export type NudgeKind = "stop_loss" | "tilt";

/** One nudge is sent once, whoever runs the companion: keyed by member, kind and occasion. */
export function nudgeKey(userId: string, kind: NudgeKind, occasion: string): string {
  return `nudge:${userId}:${kind}:${occasion}`;
}

/** A member's nudge setting as stored on their link. */
export interface NudgeSetting {
  where: Exclude<NudgeWhere, "off">;
  /** The server whose bot channel gets them (`server` only). */
  guildId: string | null;
}

/** A server's bot settings, as `/den setup` left them. */
export interface GuildSettings {
  guildId: string;
  channelId: string | null;
  recap: boolean;
  nudges: boolean;
}

export type NudgeTarget =
  | { kind: "dm"; discordId: string }
  | { kind: "channel"; channelId: string; guildId: string }
  | null;

/**
 * Where a member's nudge goes: a DM, or the bot channel of the server they chose when that
 * server still takes nudges and they're still a member there (they used /den in it). Nothing
 * when they turned nudges off, or the server stopped taking them.
 */
export function nudgeTarget(
  member: { discordId: string; guilds: readonly string[]; nudges: NudgeSetting | null },
  guild: GuildSettings | null,
): NudgeTarget {
  const n = member.nudges;
  if (!n) return null;
  if (n.where === "dm") return { kind: "dm", discordId: member.discordId };
  if (!n.guildId || !guild || guild.guildId !== n.guildId) return null;
  if (!guild.nudges || !guild.channelId || !member.guilds.includes(n.guildId)) return null;
  return { kind: "channel", channelId: guild.channelId, guildId: guild.guildId };
}

/** Whether a server should get this week's recap. */
export function wantsRecap(guild: GuildSettings): boolean {
  return guild.recap && guild.channelId !== null;
}
