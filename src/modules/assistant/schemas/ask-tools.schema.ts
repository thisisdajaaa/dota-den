import { z } from "zod";
import { META_BRACKETS } from "@/modules/meta/domain/rank-bracket";
import { CONVERSATION_ID } from "../domain/ask-chat";
import { WARD_KINDS, WARD_PHASES, WARD_SIDES } from "@/modules/guides/domain/ward-spots";

/**
 * Ask Den's tools: what the model may ask our app for, and the only way it gets data. Every
 * tool is read-only and scoped by the server to the signed-in player (or public aggregates):
 * none takes an account, user or Steam id, and unknown arguments are refused (`strict`).
 */

const hero = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .describe('Hero name as the player wrote it, e.g. "Pudge", "Anti-Mage", "AM", "lion"');
/**
 * An optional hero. "" counts as "not given": models sometimes send an empty string for "omit",
 * and the AI provider checks calls against these schemas, so "" must be valid here.
 */
const optionalHero = z
  .string()
  .trim()
  .max(40)
  .transform((v) => v || undefined)
  .optional();
const position = z
  .number()
  .int()
  .min(1)
  .max(5)
  .describe("Position 1 (safe lane carry) to 5 (hard support)");

export const ASK_TOOL_SCHEMAS = {
  my_recent_games: z
    .object({
      count: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("How many of the newest games (default 20)"),
      hero: optionalHero.describe("Only games on this hero"),
      ranked_only: z.boolean().optional().describe("Only ranked games"),
    })
    .strict(),
  my_hero_stats: z.object({ hero }).strict(),
  match_summary: z
    .object({
      // "" is accepted as "not given": models sometimes send an empty string for "omit".
      match_id: z
        .string()
        .regex(/^\d{0,20}$/)
        .transform((v) => v || undefined)
        .optional()
        .describe("A match id from my_recent_games; omit for the player's newest game"),
    })
    .strict(),
  my_sessions: z.object({}).strict(),
  my_mmr: z.object({}).strict(),
  hero_guide: z
    .object({
      hero,
      position: position.optional().describe("Build for this position, when the hero plays it"),
    })
    .strict(),
  ward_spots: z
    .object({
      side: z.enum(WARD_SIDES).describe("The player's side"),
      phase: z
        .enum(WARD_PHASES)
        .describe("early: before minute 10, mid: minute 10 to 25, late: after 25"),
      kind: z.enum(WARD_KINDS).optional().describe("observer (default) or sentry"),
    })
    .strict(),
  hero_counters: z.object({ hero }).strict(),
  meta_heroes: z
    .object({
      position: position
        .optional()
        .describe("Only this role; omit to get the strongest heroes in every role"),
      bracket: z
        .enum([...META_BRACKETS, "mine"])
        .optional()
        .describe('Rank bracket; "mine" (default) is the player\'s own from their medal'),
    })
    .strict(),
  patch_notes: z
    .object({
      hero: optionalHero.describe("What changed for this hero"),
      item: z
        .string()
        .trim()
        .max(40)
        .transform((v) => v || undefined)
        .optional()
        .describe('What changed for this item, e.g. "Black King Bar", "BKB"'),
      version: z
        .string()
        .regex(/^(?:\d{1,2}\.\d{2}[a-z]?)?$/)
        .transform((v) => v || undefined)
        .optional()
        .describe('A patch version like "7.42" or "7.41c"; omit for the latest'),
    })
    .strict(),
} as const;

export type AskToolName = keyof typeof ASK_TOOL_SCHEMAS;
export type AskToolArgs<N extends AskToolName> = z.infer<(typeof ASK_TOOL_SCHEMAS)[N]>;

export const ASK_TOOL_NAMES = Object.keys(ASK_TOOL_SCHEMAS) as AskToolName[];

export const isAskTool = (name: string): name is AskToolName =>
  Object.prototype.hasOwnProperty.call(ASK_TOOL_SCHEMAS, name);

const DESCRIPTIONS: Record<AskToolName, string> = {
  my_recent_games:
    "The player's own newest imported games: record, win rate, averages, solo/party split (unknown when the party size is missing) and each game (hero, result, K/D/A, length, match id).",
  my_hero_stats:
    "The player's own record on one hero (all imported games), their item timings in wins vs losses and lane results from parsed games, and the enemy heroes they do worst and best against while on it.",
  match_summary:
    "Use for 'my last game' or one specific match. Facts about one of the player's own matches (their newest by default): result, length, K/D/A, last hits, GPM/XPM, lane at 10 minutes, item timings, wards, percentiles. Lists what is missing.",
  my_sessions:
    "Use for tilt, tonight, today or this session. The player's latest play session (games, wins, losses, streaks, heroes), whether they are on a losing streak now, their win rate after losing streaks vs usual, and their stop-loss limits.",
  my_mmr:
    "The player's own MMR journal entries (what they logged; may be empty) and their current rank medal.",
  hero_guide:
    "A hero's build from Legend–Immortal pubs (STRATZ) or pro games: starting, early, core and situational items with timings, the skill order and talents.",
  ward_spots:
    "The most used ward spots in recent pro games for a side and game phase, with where they are on the map.",
  hero_counters:
    "Heroes a hero is strong and weak against (Legend–Immortal pubs or pro games), plus the player's own record against that hero.",
  meta_heroes:
    "The strongest heroes right now in a rank bracket (public games, the current patch), defaulting to the player's own bracket. Give a position for one role, or omit it for the top heroes of every role (use that for 'who is strong / meta right now').",
  patch_notes:
    "Valve's official patch notes: what changed for a hero or an item, or an overview of a patch (latest by default). Use for 'what changed', 'was X nerfed/buffed', 'what's new in 7.xx'.",
};

/** The tool list sent to the model (JSON schemas made from the zod schemas above). */
export const ASK_TOOL_DEFINITIONS = ASK_TOOL_NAMES.map((name) => {
  const { $schema: _s, ...parameters } = z.toJSONSchema(ASK_TOOL_SCHEMAS[name], {
    io: "input",
  }) as Record<string, unknown>;
  return { name, description: DESCRIPTIONS[name], parameters };
});

/** A tool call's arguments checked, or why they were refused (sent back to the model). */
export function parseToolArgs(
  name: string,
  raw: string,
): { ok: true; name: AskToolName; args: unknown } | { ok: false; error: string } {
  if (!isAskTool(name)) return { ok: false, error: `unknown tool "${name.slice(0, 40)}"` };
  let json: unknown;
  try {
    json = raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return { ok: false, error: "arguments are not valid JSON" };
  }
  const parsed = ASK_TOOL_SCHEMAS[name].safeParse(json ?? {});
  if (!parsed.success)
    return {
      ok: false,
      error: `invalid arguments: ${parsed.error.issues
        .map((i) => `${i.path.join(".") || "(root)"} ${i.message}`)
        .join("; ")
        .slice(0, 200)}`,
    };
  return { ok: true, name, args: parsed.data };
}

/** The question a player sends. */
export const AskRequestSchema = z.object({
  question: z.string().trim().min(1).max(500),
  /** Asked from a match page: "this match" means this one. */
  matchId: z
    .string()
    .regex(/^\d{1,20}$/)
    .optional(),
  /** The conversation to continue; omitted starts a new one. */
  conversationId: z.string().regex(CONVERSATION_ID).optional(),
});
export type AskRequest = z.infer<typeof AskRequestSchema>;

/** Picks one conversation (GET to open it, DELETE to forget it; DELETE ?all=1 forgets all). */
export const AskConversationQuerySchema = z.object({
  c: z.string().regex(CONVERSATION_ID).optional(),
  all: z.literal("1").optional(),
});
