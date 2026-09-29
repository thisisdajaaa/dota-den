import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";

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
});
