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
  const at = new Date();
  const msg = (text: string) => ({ role: "user" as const, text, at });
  const create = (userId: string, title: string, max = 30, expiresAt = later) =>
    chats.create(userId, [msg(title)], {
      title,
      now: new Date(),
      expiresAt,
      maxConversations: max,
    });

  it("keeps only the newest messages of a conversation, and forgets an expired one", async () => {
    const id = await create("u1", "q0");
    for (let i = 1; i < 6; i++)
      expect(
        await chats.append("u1", id, [msg(`q${i}`)], { keep: 4, now: at, expiresAt: later }),
      ).toBe(true);
    expect((await chats.get("u1", id))!.map((m) => m.text)).toEqual(["q2", "q3", "q4", "q5"]);
    const old = await create("u2", "old", 30, new Date(Date.now() - 1000));
    expect(await chats.get("u2", old)).toBeNull();
    expect(await chats.list("u2", 10)).toEqual([]);
  });

  it("never lets one player read, add to or delete another's conversation", async () => {
    const id = await create("u1", "mine");
    expect(await chats.get("u9", id)).toBeNull();
    expect(await chats.append("u9", id, [msg("x")], { keep: 4, now: at, expiresAt: later })).toBe(
      false,
    );
    expect(await chats.remove("u9", id)).toBe(false);
    expect(await chats.get("u1", id)).not.toBeNull();
  });

  it("lists newest first with titles, and caps how many a player keeps", async () => {
    await chats.clear("u3");
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) ids.push(await create("u3", `chat ${i}`, 3));
    const list = await chats.list("u3", 10);
    expect(list.map((c) => c.title)).toEqual(["chat 3", "chat 2", "chat 1"]);
    expect(list[0]).toMatchObject({ id: ids[3], messages: 1 });
    expect(await chats.get("u3", ids[0])).toBeNull();
  });

  it("deletes one conversation, or all of a player's", async () => {
    const a = await create("u4", "a");
    const b = await create("u4", "b");
    expect(await chats.remove("u4", a)).toBe(true);
    expect((await chats.list("u4", 10)).map((c) => c.id)).toEqual([b]);
    await chats.clear("u4");
    expect(await chats.list("u4", 10)).toEqual([]);
  });
});
