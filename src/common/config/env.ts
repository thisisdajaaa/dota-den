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
  /** Vision model (Groq) that reads an MMR from a screenshot in the MMR dialog. */
  MMR_VISION_MODEL: z.string().trim().min(1).default("qwen/qwen3.8-27b"),
  DRAFT_AI_MOVE_TIMEOUT_MS: positiveInt(15_000, 120_000),
  DRAFT_AI_REVIEW_TIMEOUT_MS: positiveInt(30_000, 300_000),
  DRAFT_AI_REVIEW_ENABLED: flag(true),
  /**
   * Groq calls per UTC day, across every instance, shared by the AI captain, the draft review
   * and the AI match coach (one budget for every paid model call).
   */
  DRAFT_AI_BUDGET_PER_DAY: positiveInt(2_000, 1_000_000),
  /** AI match coach (ADR 0014): on when a Groq key is set, unless this is "false". */
  MATCH_COACH_ENABLED: flag(true),
  /** Groq model for the match coach. Defaults to the draft AI's model. */
  MATCH_COACH_MODEL: z.string().trim().min(1).optional(),
  /** Time limit for one coach answer (the service may ask twice). */
  MATCH_COACH_TIMEOUT_MS: positiveInt(25_000, 120_000),

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
    /** Time limit for each database operation (driver CSOT `timeoutMS`); 0 means none. */
    MONGODB_TIMEOUT_MS: z.coerce.number().int().min(0).max(600_000).default(10_000),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    OPENDOTA_API_KEY: z.string().min(1).optional(),
    /** Override for tests (fixture server). Defaults to the public API. */
    OPENDOTA_BASE_URL: z.url().optional(),
    /** Override for tests (fixture server). Defaults to Valve's datafeed. */
    VALVE_DATAFEED_BASE_URL: z.url().optional(),
    /** Tests only: where /img routes read hero and rank art (fixture server), not the CDNs. */
    IMAGE_SOURCE_BASE_URL: z.url().optional(),
    /**
     * STRATZ API token (stratz.com/api): real per-position public stats for the Meta page.
     * Unset: the Meta page reads positions from OpenDota lane data and hero roles, as before.
     */
    STRATZ_API_TOKEN: z.string().trim().min(1).optional(),
    /** Override for tests (fixture server). Defaults to https://api.stratz.com. */
    STRATZ_API_BASE_URL: z.url().optional(),
    /** Groq key for the AI draft opponent; without it the AI uses a rule-based fallback. */
    GROQ_API_KEY: z.string().min(1).optional(),
    /** Groq key for the AI match coach only; defaults to GROQ_API_KEY. */
    MATCH_COACH_API_KEY: z.string().min(1).optional(),
    /** Override for tests (fixture server). Defaults to Groq's API (https://api.groq.com). */
    GROQ_BASE_URL: z.url().optional(),
    /** Multiplayer draft rooms (spec release gate: feature flag). Default on. */
    FEATURE_DRAFT_ROOMS: z
      .enum(["true", "false"])
      .optional()
      .transform((v) => v !== "false"),
    /** Steam Web API key: "Friends playing now" on the overview. Unset: the strip is off. */
    STEAM_WEB_API_KEY: z.string().min(1).optional(),
    /** Override for tests (fixture server). Defaults to Steam's Web API. */
    STEAM_API_BASE_URL: z.url().optional(),
    /** Twitch app credentials: embed matching streams on live game pages. Unset: search links only. */
    /**
     * Discord application (discord.com/developers): "Connect Discord" on the account page
     * (client id + secret, OAuth2 `identify`) and the Dota Den bot's slash commands (public
     * key, to verify interactions; bot token, only for registering the commands).
     */
    DISCORD_CLIENT_ID: z
      .string()
      .regex(/^\d{15,25}$/)
      .optional(),
    DISCORD_CLIENT_SECRET: z.string().min(1).optional(),
    DISCORD_PUBLIC_KEY: z
      .string()
      .regex(/^[0-9a-f]{64}$/i)
      .optional(),
    DISCORD_BOT_TOKEN: z.string().min(1).optional(),
    TWITCH_CLIENT_ID: z.string().min(1).optional(),
    TWITCH_CLIENT_SECRET: z.string().min(1).optional(),
    /** Overrides for tests (fixture server). Default to Twitch's. */
    TWITCH_API_BASE_URL: z.url().optional(),
    TWITCH_AUTH_URL: z.url().optional(),
    /** Kick app credentials (kick.com/settings/developer): Kick streams on /live. Unset: Twitch only. */
    KICK_CLIENT_ID: z.string().min(1).optional(),
    KICK_CLIENT_SECRET: z.string().min(1).optional(),
    /** Overrides for tests (fixture server). Default to Kick's. */
    KICK_API_BASE_URL: z.url().optional(),
    KICK_AUTH_URL: z.url().optional(),
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
    /**
     * Web Push (VAPID) keys: `npx web-push generate-vapid-keys`. Unset: notifications are off
     * and the account page says so. The subject is a mailto: or https: contact for push services.
     */
    VAPID_PUBLIC_KEY: z.string().min(1).optional(),
    VAPID_PRIVATE_KEY: z.string().min(1).optional(),
    VAPID_SUBJECT: z
      .string()
      .regex(/^(mailto:|https:\/\/)/, "VAPID_SUBJECT must start with mailto: or https://")
      .optional(),
    /**
     * Weekly email (Resend). Set both or neither. Unset: email is off, the account page says
     * so and nothing is sent. EMAIL_FROM needs a domain verified in Resend.
     */
    RESEND_API_KEY: z.string().min(1).optional(),
    EMAIL_FROM: z
      .string()
      .regex(
        /^([^<>\r\n]+ <[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>|[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)$/,
        'EMAIL_FROM must be "Name <address@domain>" or an address',
      )
      .optional(),
    /** Override for tests (fixture server). Defaults to https://api.resend.com. */
    RESEND_API_BASE_URL: z.url().optional(),
    /** Signs links in emails. Defaults to a key derived from RESEND_API_KEY. */
    EMAIL_TOKEN_SECRET: z.string().min(32).optional(),
    /**
     * Resend webhook signing secret (`whsec_…`, Svix): bounces and spam complaints stop the
     * weekly email to that address. Unset: the webhook endpoint answers 404.
     */
    RESEND_WEBHOOK_SECRET: z
      .string()
      .trim()
      .regex(
        /^whsec_[A-Za-z0-9+/]{16,}={0,2}$/,
        "RESEND_WEBHOOK_SECRET must look like whsec_<base64>",
      )
      .optional(),
    /**
     * Public contact address shown on the privacy, terms and refund pages (a mailto link).
     * Unset: those pages point to the self-service Account page instead.
     */
    SUPPORT_EMAIL: z.email("SUPPORT_EMAIL must be an email address").optional(),
    /** Bearer secret for scheduled jobs (Vercel Cron). Cron routes answer 503 when unset. */
    CRON_SECRET: z.string().min(16).optional(),
    /**
     * Owner alerts also go to this Discord webhook (a private channel), besides admins' devices.
     * Only Discord webhook URLs are accepted: the server POSTs to it.
     */
    ADMIN_ALERT_WEBHOOK_URL: z
      .string()
      .trim()
      .regex(
        /^https:\/\/(discord\.com|discordapp\.com|ptb\.discord\.com|canary\.discord\.com)\/api\/webhooks\/\d{17,20}\/[A-Za-z0-9_-]{40,100}$/,
        "ADMIN_ALERT_WEBHOOK_URL must be a Discord webhook URL (https://discord.com/api/webhooks/<id>/<token>)",
      )
      .optional(),
    ...TUNING,

    // ---- Dota Den Plus (ADR 0013). All optional: unset, Plus doesn't exist. -------------
    /** The payment provider (merchant of record). Unset: no pricing, no webhook (404). */
    BILLING_PROVIDER: z.enum(["lemonsqueezy"]).optional(),
    /** Kill switch. Only "true" grants Plus; anything else treats everyone as free (data kept). */
    PLUS_ENABLED: booleanFlag,
    /** Lemon Squeezy webhook signing secret (Settings → Webhooks). Required with the provider. */
    LEMONSQUEEZY_WEBHOOK_SECRET: z.string().trim().min(16).max(200).optional(),
    /** Checkout links per plan (each variant's share link). A plan without one isn't offered. */
    LEMONSQUEEZY_CHECKOUT_URL_MONTHLY: z.url({ protocol: /^https$/ }).optional(),
    LEMONSQUEEZY_CHECKOUT_URL_YEARLY: z.url({ protocol: /^https$/ }).optional(),
    /** The store (https://<store>.lemonsqueezy.com or a custom domain); defaults to the checkout's. */
    LEMONSQUEEZY_STORE_URL: z.url({ protocol: /^https$/ }).optional(),
    /** Variant ids per plan, so the account page can say "monthly" or "yearly" (optional). */
    LEMONSQUEEZY_VARIANT_ID_MONTHLY: z
      .string()
      .trim()
      .regex(/^\d{1,20}$/)
      .optional(),
    LEMONSQUEEZY_VARIANT_ID_YEARLY: z
      .string()
      .trim()
      .regex(/^\d{1,20}$/)
      .optional(),
    /** "true" on a deployment that takes test-mode purchases (and ignores live ones). */
    LEMONSQUEEZY_TEST_MODE: booleanFlag,
    // ---- end Dota Den Plus ------------------------------------------------------------

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
    if (!env.VAPID_PUBLIC_KEY !== !env.VAPID_PRIVATE_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["VAPID_PRIVATE_KEY"],
        message: "Set both VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY, or neither",
      });
    }
    if (!env.RESEND_API_KEY !== !env.EMAIL_FROM) {
      ctx.addIssue({
        code: "custom",
        path: ["EMAIL_FROM"],
        message: "Set both RESEND_API_KEY and EMAIL_FROM, or neither",
      });
    }
    if (env.BILLING_PROVIDER === "lemonsqueezy" && !env.LEMONSQUEEZY_WEBHOOK_SECRET) {
      ctx.addIssue({
        code: "custom",
        path: ["LEMONSQUEEZY_WEBHOOK_SECRET"],
        message: "BILLING_PROVIDER=lemonsqueezy needs LEMONSQUEEZY_WEBHOOK_SECRET",
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
