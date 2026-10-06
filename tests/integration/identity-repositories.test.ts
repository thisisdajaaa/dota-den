import type { Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SteamId64 } from "@/modules/identity/domain/steam-id";
import { IDENTITY_COLLECTIONS } from "@/modules/identity/identity.model";
import { NoncesRepository } from "@/modules/identity/repositories/nonces.repository";
import { SessionsRepository } from "@/modules/identity/repositories/sessions.repository";
import { UsersRepository } from "@/modules/identity/repositories/users.repository";
import { createTestDb } from "../support/mongo";

let db: Db;
let teardown: () => Promise<void>;

beforeAll(async () => {
  ({ db, teardown } = await createTestDb());
  const getDb = async () => db;
  await Promise.all([
    new UsersRepository(getDb).ensureIndexes(),
    new SessionsRepository(getDb).ensureIndexes(),
    new NoncesRepository(getDb).ensureIndexes(),
  ]);
});
afterAll(async () => teardown?.());

describe("UsersRepository", () => {
  it("upserts idempotently by SteamID64 and keeps createdAt", async () => {
    const users = new UsersRepository(async () => db);
    const steamId64 = "76561197960287930" as SteamId64;
    const t1 = new Date("2026-09-01T00:00:00Z");
    const t2 = new Date("2026-09-02T00:00:00Z");

    const a = await users.upsertBySteamId({ steamId64, isAdmin: false, now: t1 });
    const b = await users.upsertBySteamId({ steamId64, isAdmin: true, now: t2 });

    expect(b.id).toBe(a.id);
    expect(b.createdAt).toEqual(t1);
    expect(b.updatedAt).toEqual(t2);
    expect(b.roles).toEqual(["admin"]);
    expect(b.accountId32).toBe(22202);
    expect(b.settings.profileVisibility).toBe("private");
    expect(await db.collection(IDENTITY_COLLECTIONS.users).countDocuments({ steamId64 })).toBe(1);
    expect(await users.findById(a.id)).toMatchObject({ steamId64 });
    expect(await users.findById("not-an-object-id")).toBeNull();
  });

  it("stores SteamID64 as a string", async () => {
    const doc = await db.collection(IDENTITY_COLLECTIONS.users).findOne({});
    expect(typeof doc?.steamId64).toBe("string");
  });
});

describe("SessionsRepository", () => {
  it("creates, replaces and deletes by token hash", async () => {
    const sessions = new SessionsRepository(async () => db);
    const now = new Date();
    const record = {
      tokenHash: "h1",
      userId: "u1",
      createdAt: now,
      rotatedAt: now,
      expiresAt: new Date(now.getTime() + 60_000),
    };
    await sessions.create(record);
    expect(await sessions.findByTokenHash("h1")).toEqual(record);

    expect(await sessions.replace("h1", { ...record, tokenHash: "h2" })).toBe(true);
    expect(await sessions.replace("h1", { ...record, tokenHash: "h3" })).toBe(false);
    expect(await sessions.findByTokenHash("h1")).toBeNull();

    await sessions.delete("h2");
    expect(await sessions.findByTokenHash("h2")).toBeNull();
  });

  it("rejects duplicate token hashes and has a TTL index", async () => {
    const sessions = new SessionsRepository(async () => db);
    const now = new Date();
    const record = {
      tokenHash: "dup",
      userId: "u1",
      createdAt: now,
      rotatedAt: now,
      expiresAt: now,
    };
    await sessions.create(record);
    await expect(sessions.create(record)).rejects.toMatchObject({ code: 11000 });

    const indexes = await db.collection(IDENTITY_COLLECTIONS.sessions).indexes();
    expect(indexes.find((i) => i.name === "ttl_expiresAt")?.expireAfterSeconds).toBe(0);
  });
});

describe("NoncesRepository", () => {
  it("accepts a nonce once and rejects replays, including concurrent ones", async () => {
    const nonces = new NoncesRepository(async () => db);
    const expires = new Date(Date.now() + 60_000);
    const results = await Promise.all([
      nonces.consume("steam:n1", expires),
      nonces.consume("steam:n1", expires),
      nonces.consume("steam:n1", expires),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await nonces.consume("steam:n2", expires)).toBe(true);
  });
});
