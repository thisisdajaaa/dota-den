import "server-only";
import { z } from "zod";

const booleanFlag = z
  .enum(["true", "false"])
  .optional()
  .transform((v) => v === "true");

// ---------------------------------------------------------------------------
// Operator tuning. Every value is optional, and each default is the value that was
// hard-coded before, so an unset variable changes nothing. Pure domain code never reads
// these: composition roots and infrastructure pass them in. See docs/configuration.md.
// ---------------------------------------------------------------------------

/** A positive integer read from a string, with a default and an upper bound. */
const positiveInt = (fallback: number, max: number) =>
  z.coerce.number().int().min(1).max(max).default(fallback);
/** A non-negative integer (e.g. retry counts, where 0 means "no retries"). */
const nonNegativeInt = (fallback: number, max: number) =>
  z.coerce.number().int().min(0).max(max).default(fallback);
/** "true"/"false", with a default when unset. */
const flag = (fallback: boolean) =>
  z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? fallback : v === "true"));

export const DEFAULT_DRAFT_AI_MODEL = "openai/gpt-oss-120b";

const TUNING = {
  // Rate limits per client (IP) for the public draft API. Per minute unless noted.
  RATE_LIMIT_DRAFT_AI_MOVE_PER_MIN: positiveInt(40, 10_000),
  RATE_LIMIT_DRAFT_SUGGESTIONS_PER_MIN: positiveInt(60, 10_000),
  RATE_LIMIT_DRAFT_OUTLOOK_PER_MIN: positiveInt(60, 10_000),
  RATE_LIMIT_DRAFT_REVIEW_PER_MIN: positiveInt(6, 10_000),
  RATE_LIMIT_DRAFT_CHALLENGE_PER_MIN: positiveInt(30, 10_000),
  RATE_LIMIT_ROOM_CREATE_PER_HOUR: positiveInt(10, 10_000),
  RATE_LIMIT_ROOM_POLL_PER_MIN: positiveInt(240, 10_000),
  RATE_LIMIT_ROOM_ACTION_PER_MIN: positiveInt(120, 10_000),

  // Multiplayer draft rooms (ADR 0003 abuse caps).
  DRAFT_ROOMS_MAX_ACTIVE: positiveInt(50, 10_000),
  DRAFT_ROOMS_ACTIVE_WINDOW_MINUTES: positiveInt(120, 7 * 24 * 60),
  DRAFT_ROOM_TTL_HOURS: positiveInt(24, 24 * 90),

  // Tournament data for the draft AI (OpenDota explorer).
  DRAFT_PRO_WINDOW_DAYS: positiveInt(21, 365),
  DRAFT_SYNERGY_WINDOW_DAYS: positiveInt(60, 365),
  DRAFT_META_FRESH_HOURS: positiveInt(12, 24 * 7),
  DRAFT_EXPLORER_BUDGET_MS: positiveInt(4_000, 120_000),

  // OpenDota gateways.
  OPENDOTA_TIMEOUT_MS: positiveInt(8_000, 120_000),
  OPENDOTA_MAX_RETRIES: nonNegativeInt(2, 10),
  OPENDOTA_EXPLORER_TIMEOUT_MS: positiveInt(30_000, 300_000),
  OPENDOTA_EXPLORER_MAX_RETRIES: nonNegativeInt(1, 10),

  // Language model (Groq) for the AI captain and the AI review.
  DRAFT_AI_MODEL: z.string().trim().min(1).default(DEFAULT_DRAFT_AI_MODEL),
  DRAFT_AI_MOVE_TIMEOUT_MS: positiveInt(15_000, 120_000),
  DRAFT_AI_REVIEW_TIMEOUT_MS: positiveInt(30_000, 300_000),
  DRAFT_AI_REVIEW_ENABLED: flag(true),

  // Leaderboards.
  LEADERBOARD_ROW_LIMIT: positiveInt(50, 500),
  LEADERBOARD_EVERYONE_MAX_PLAYERS: positiveInt(5_000, 100_000),

  // Sessions: the break that splits two sessions, for users who haven't picked one.
  SESSION_DEFAULT_GAP_MINUTES: z
    .enum(["30", "60", "90", "120"])
    .default("60")
    .transform((v) => Number(v) as 30 | 60 | 90 | 120),
};
// --------------------------- end operator tuning ---------------------------

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_URL: z.url(),
    MONGODB_URI: z.string().min(1),
    MONGODB_DB_NAME: z.string().min(1).default("dota_den_dev"),
    MONGODB_MAX_POOL_SIZE: z.coerce.number().int().min(1).max(100).default(10),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    OPENDOTA_API_KEY: z.string().min(1).optional(),
    /** Override for tests (fixture server). Defaults to the public API. */
    OPENDOTA_BASE_URL: z.url().optional(),
    /** Override for tests (fixture server). Defaults to Valve's datafeed. */
    VALVE_DATAFEED_BASE_URL: z.url().optional(),
    /** Groq key for the AI draft opponent; without it the AI uses a rule-based fallback. */
    GROQ_API_KEY: z.string().min(1).optional(),
    /** Multiplayer draft rooms (spec release gate: feature flag). Default on. */
    FEATURE_DRAFT_ROOMS: z
      .enum(["true", "false"])
      .optional()
      .transform((v) => v !== "false"),
    STEAM_WEB_API_KEY: z.string().min(1).optional(),
    /** Twitch app credentials: embed matching streams on live game pages. Unset: search links only. */
    TWITCH_CLIENT_ID: z.string().min(1).optional(),
    TWITCH_CLIENT_SECRET: z.string().min(1).optional(),
    /** Overrides for tests (fixture server). Default to Twitch's. */
    TWITCH_API_BASE_URL: z.url().optional(),
    TWITCH_AUTH_URL: z.url().optional(),
    ADMIN_STEAM_IDS: z
      .string()
      .optional()
      .transform((v) =>
        (v ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    AUTH_TEST_MODE: booleanFlag,
    /** Bearer secret for scheduled jobs (Vercel Cron). Cron routes answer 503 when unset. */
    CRON_SECRET: z.string().min(16).optional(),
    ...TUNING,

    // ---- Redis and background jobs (Upstash, ADR 0008). All optional. -----------------
    // Unset: per-instance rate limits and caches, and background work runs in-process
    // with `after()`, exactly as before.
    /** Upstash Redis REST endpoint: shared rate limits, upstream cache, OpenDota budget. */
    UPSTASH_REDIS_REST_URL: z.url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
    /** Upstash QStash token: durable jobs POSTed to `${APP_URL}/api/jobs/<name>`. */
    QSTASH_TOKEN: z.string().min(1).optional(),
    /** QStash API base URL (regional endpoint or local dev server). Defaults to QStash's. */
    QSTASH_URL: z.url().optional(),
    /** Signing keys that job endpoints verify QStash requests with. */
    QSTASH_CURRENT_SIGNING_KEY: z.string().min(1).optional(),
    QSTASH_NEXT_SIGNING_KEY: z.string().min(1).optional(),
    /** Global OpenDota call budget (needs Redis). Defaults depend on OPENDOTA_API_KEY. */
    OPENDOTA_BUDGET_PER_MINUTE: z.coerce.number().int().min(1).optional(),
    OPENDOTA_BUDGET_PER_DAY: z.coerce.number().int().min(1).optional(),
    /** Set by Vercel when deployment protection allows automation: lets QStash reach staging. */
    VERCEL_AUTOMATION_BYPASS_SECRET: z.string().min(1).optional(),
    // ---- end Redis and background jobs ------------------------------------------------
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && env.AUTH_TEST_MODE) {
      ctx.addIssue({
        code: "custom",
        path: ["AUTH_TEST_MODE"],
        message: "AUTH_TEST_MODE must never be enabled in production",
      });
    }
    // Redis and background jobs (ADR 0008).
    if (!env.UPSTASH_REDIS_REST_URL !== !env.UPSTASH_REDIS_REST_TOKEN) {
      ctx.addIssue({
        code: "custom",
        path: ["UPSTASH_REDIS_REST_TOKEN"],
        message: "Set both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN, or neither",
      });
    }
    if (env.QSTASH_TOKEN && !env.QSTASH_CURRENT_SIGNING_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["QSTASH_CURRENT_SIGNING_KEY"],
        message: "QSTASH_TOKEN needs QSTASH_CURRENT_SIGNING_KEY so job endpoints can verify calls",
      });
    }
  });

/** OpenDota budget defaults: the free tier's limits, or higher with an API key. */
export function openDotaBudget(e: Env): { perMinute: number; perDay: number } {
  return {
    perMinute: e.OPENDOTA_BUDGET_PER_MINUTE ?? (e.OPENDOTA_API_KEY ? 1_200 : 60),
    perDay: e.OPENDOTA_BUDGET_PER_DAY ?? (e.OPENDOTA_API_KEY ? 100_000 : 3_000),
  };
}

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

export function parseEnv(source: Record<string, string | undefined>): Env {
  // Treat empty strings (e.g. `KEY=` in .env files) as unset.
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== ""));
  const result = EnvSchema.safeParse(cleaned);
  if (!result.success) {
    // Only report key names and messages, never values.
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return result.data;
}

export function env(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
