import { describe, expect, it } from "vitest";
import { parseEnv } from "@/common/config/env";

const base = { APP_URL: "http://localhost:3000", MONGODB_URI: "mongodb://localhost:27017" };

describe("parseEnv", () => {
  it("applies defaults and treats empty strings as unset", () => {
    const env = parseEnv({ ...base, OPENDOTA_API_KEY: "", ADMIN_STEAM_IDS: "1, 2 ,," });
    expect(env.MONGODB_DB_NAME).toBe("dota_den_dev");
    expect(env.OPENDOTA_API_KEY).toBeUndefined();
    expect(env.ADMIN_STEAM_IDS).toEqual(["1", "2"]);
    expect(env.AUTH_TEST_MODE).toBe(false);
  });

  it("refuses AUTH_TEST_MODE in production", () => {
    expect(() => parseEnv({ ...base, NODE_ENV: "production", AUTH_TEST_MODE: "true" })).toThrow(
      /AUTH_TEST_MODE/,
    );
  });

  it("does not echo secret values in errors", () => {
    const secret = "mongodb+srv://user:hunter2@cluster";
    expect(() => parseEnv({ MONGODB_URI: secret, APP_URL: "not a url" })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining("hunter2") }),
    );
  });

  it("defaults every operator setting to the previously hard-coded value", () => {
    const env = parseEnv(base);
    expect(env).toMatchObject({
      RATE_LIMIT_DRAFT_AI_MOVE_PER_MIN: 40,
      RATE_LIMIT_DRAFT_REVIEW_PER_MIN: 6,
      RATE_LIMIT_ROOM_POLL_PER_MIN: 240,
      DRAFT_ROOMS_MAX_ACTIVE: 50,
      DRAFT_ROOM_TTL_HOURS: 24,
      DRAFT_PRO_WINDOW_DAYS: 21,
      DRAFT_SYNERGY_WINDOW_DAYS: 60,
      DRAFT_META_FRESH_HOURS: 12,
      DRAFT_EXPLORER_BUDGET_MS: 4_000,
      OPENDOTA_TIMEOUT_MS: 8_000,
      OPENDOTA_MAX_RETRIES: 2,
      DRAFT_AI_MODEL: "openai/gpt-oss-120b",
      DRAFT_AI_REVIEW_ENABLED: true,
      LEADERBOARD_ROW_LIMIT: 50,
      SESSION_DEFAULT_GAP_MINUTES: 60,
    });
  });

  it("reads operator settings from strings and rejects bad values", () => {
    const env = parseEnv({
      ...base,
      RATE_LIMIT_DRAFT_REVIEW_PER_MIN: "12",
      OPENDOTA_MAX_RETRIES: "0",
      DRAFT_AI_REVIEW_ENABLED: "false",
      SESSION_DEFAULT_GAP_MINUTES: "90",
    });
    expect(env.RATE_LIMIT_DRAFT_REVIEW_PER_MIN).toBe(12);
    expect(env.OPENDOTA_MAX_RETRIES).toBe(0);
    expect(env.DRAFT_AI_REVIEW_ENABLED).toBe(false);
    expect(env.SESSION_DEFAULT_GAP_MINUTES).toBe(90);
    expect(() => parseEnv({ ...base, RATE_LIMIT_DRAFT_REVIEW_PER_MIN: "0" })).toThrow();
    expect(() => parseEnv({ ...base, SESSION_DEFAULT_GAP_MINUTES: "45" })).toThrow();
    expect(() => parseEnv({ ...base, DRAFT_AI_REVIEW_ENABLED: "yes" })).toThrow();
  });
});
