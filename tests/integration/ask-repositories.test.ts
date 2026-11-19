import type { Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AskChatsRepository,
  AskUsageRepository,
} from "@/modules/assistant/repositories/ask.repository";
import { createTestDb } from "../support/mongo";

let db: Db;
let teardown: () => Promise<void>;
let chats: AskChatsRepository;
let usage: AskUsageRepository;

beforeAll(async () => {
  ({ db, teardown } = await createTestDb());
  chats = new AskChatsRepository(async () => db);
  usage = new AskUsageRepository(async () => db);
  await Promise.all([chats.ensureIndexes(), usage.ensureIndexes()]);
});
afterAll(async () => teardown?.());

const later = new Date(Date.now() + 86_400_000);

describe("AskUsageRepository", () => {
  it("never lets concurrent questions go past the daily limit", async () => {
    const results = await Promise.all(
      Array.from({ length: 12 }, () => usage.reserve("u1", "2026-11-18", 5, later)),
    );
    expect(results.filter(Boolean)).toHaveLength(5);
    expect(await usage.used("u1", "2026-11-18")).toBe(5);
    // Another day, and another player, count apart.
    expect(await usage.reserve("u1", "2026-11-19", 5, later)).toBe(true);
    expect(await usage.reserve("u2", "2026-11-18", 5, later)).toBe(true);
  });

  it("gives a question back, never below zero", async () => {
    await usage.release("u1", "2026-11-18");
    expect(await usage.used("u1", "2026-11-18")).toBe(4);
    expect(await usage.reserve("u1", "2026-11-18", 5, later)).toBe(true);
    await usage.release("u3", "2026-11-18");
    expect(await usage.used("u3", "2026-11-18")).toBe(0);
  });

  it("exports and deletes a player's counts", async () => {
    expect(await usage.exportForOwner({ userId: "u1", accountId32: 1 })).toHaveLength(2);
    expect(await usage.deleteForOwner({ userId: "u1", accountId32: 1 })).toBe(2);
    expect(await usage.used("u1", "2026-11-18")).toBe(0);
  });
});

describe("AskChatsRepository", () => {
  it("keeps only the newest messages, and forgets an expired chat", async () => {
    const at = new Date();
    for (let i = 0; i < 6; i++)
      await chats.append("u1", [{ role: "user", text: `q${i}`, at }], {
        keep: 4,
        now: at,
        expiresAt: later,
      });
    expect((await chats.get("u1")).map((m) => m.text)).toEqual(["q2", "q3", "q4", "q5"]);
    await chats.append("u2", [{ role: "user", text: "old", at }], {
      keep: 4,
      now: at,
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(await chats.get("u2")).toEqual([]);
  });

  it("clears a chat", async () => {
    await chats.clear("u1");
    expect(await chats.get("u1")).toEqual([]);
  });
});
