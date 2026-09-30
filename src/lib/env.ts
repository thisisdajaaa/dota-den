import "server-only";
import { z } from "zod";

const booleanFlag = z
  .enum(["true", "false"])
  .optional()
  .transform((v) => v === "true");

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
    DRAFT_AI_MODEL: z.string().min(1).optional(),
    STEAM_WEB_API_KEY: z.string().min(1).optional(),
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
