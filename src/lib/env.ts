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
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && env.AUTH_TEST_MODE) {
      ctx.addIssue({
        code: "custom",
        path: ["AUTH_TEST_MODE"],
        message: "AUTH_TEST_MODE must never be enabled in production",
      });
    }
  });

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
