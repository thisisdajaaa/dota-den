import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { SteamId64 } from "@/modules/identity/domain/steam-id";

/**
 * The OpenDota budget lane with the real identity wiring: the identity container registers
 * the session check, and a sign-in cookie only counts when it matches a stored session.
 */
let sessionCookie: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "dd_session" && sessionCookie !== undefined ? { value: sessionCookie } : undefined,
  }),
}));

const DB_NAME = `dd_test_lane_${randomUUID().slice(0, 8)}`;
process.env.MONGODB_URI = process.env.MONGODB_TEST_URI ?? "mongodb://127.0.0.1:27017";
process.env.MONGODB_DB_NAME = DB_NAME;
process.env.APP_URL ??= "http://localhost:3000";

const { sessionsRepository, usersRepository } =
  await import("@/modules/identity/identity.container");
const { generateToken, hashToken } = await import("@/modules/identity/domain/session-tokens");
const { lane } = await import("@/common/providers/shared-gateway-options");
const { getDb, getMongoClient } = await import("@/common/db/mongo");

let token: string;

beforeAll(async () => {
  const user = await usersRepository.upsertBySteamId({
    steamId64: "76561197960287930" as SteamId64,
    isAdmin: false,
    now: new Date(),
  });
  // A stored session, as sign-in creates one.
  token = generateToken();
  const now = new Date();
  await sessionsRepository.create({
    tokenHash: hashToken(token),
    userId: user.id,
    createdAt: now,
    rotatedAt: now,
    expiresAt: new Date(now.getTime() + 86_400_000),
  });
});

afterAll(async () => {
  await (await getDb()).dropDatabase();
  await (await getMongoClient()).close();
});

describe("budget lane with real sessions", () => {
  it("bills a made-up dd_session cookie as a guest", async () => {
    sessionCookie = "not-a-real-session-token";
    expect(await lane()).toBe("guest");
  });

  it("bills a real session as a member", async () => {
    sessionCookie = token;
    expect(await lane()).toBe("member");
  });
});
