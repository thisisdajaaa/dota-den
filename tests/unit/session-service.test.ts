import { describe, expect, it } from "vitest";
import type { SessionNotesPort, SessionSettingsPort } from "@/modules/sessions/sessions.ports";
import { SessionService } from "@/modules/sessions/sessions.service";
import type { GapMinutes, SessionMatch } from "@/modules/sessions/domain/session";
import type { SessionNote } from "@/modules/sessions/domain/session-note";

const DAY = 86_400_000;
const T0 = Date.parse("2026-09-01T18:00:00Z");

function match(i: number, startMs: number): SessionMatch {
  return {
    matchId: String(7_000_000_000 + i),
    startedAt: new Date(startMs),
    durationSec: 1800,
    heroId: 1,
    result: i % 2 ? "win" : "loss",
    kills: 5,
    deaths: 3,
    assists: 10,
    ranked: true,
    queueClass: "solo",
    partySize: 1,
  };
}

function build(matches: SessionMatch[]) {
  const notes = new Map<string, SessionNote>();
  let gap: GapMinutes | null = null;
  const noteRepo: SessionNotesPort = {
    async upsert(n) {
      notes.set(`${n.userId}|${n.sessionId}`, n);
      return n;
    },
    async get(userId, sessionId) {
      return notes.get(`${userId}|${sessionId}`) ?? null;
    },
    async listForSessions(userId, ids) {
      return [...notes.values()].filter((n) => n.userId === userId && ids.includes(n.sessionId));
    },
    async listRecent(userId, accountId32) {
      return [...notes.values()].filter(
        (n) => n.userId === userId && n.accountId32 === accountId32,
      );
    },
  };
  const settings: SessionSettingsPort = {
    async getGap() {
      return gap;
    },
    async setGap(_u, g) {
      gap = g;
    },
  };
  const service = new SessionService({
    matches: { listMatches: async () => matches },
    observations: { list: async () => [] },
    notes: noteRepo,
    settings,
  });
  return { service, notes };
}

const me = { userId: "u1", accountId32: 22202 };
const input = { note: "calm", goal: "fewer deaths", goalMet: "yes" as const };

describe("SessionService", () => {
  // 12 matches, one per day, like the E2E fixture.
  const daily = Array.from({ length: 12 }, (_, i) => match(i + 1, T0 + i * DAY));

  it("lists sessions newest first, 10 per page, with the default 60 minute gap", async () => {
    const { service } = build(daily);
    const p1 = await service.list(me, 1);
    expect(p1).toMatchObject({ gapMinutes: 60, totalSessions: 12, pageCount: 2, page: 1 });
    expect(p1.items).toHaveLength(10);
    expect(p1.items[0].session.matches[0].matchId).toBe("7000000012");
    expect(p1.items[0].mmr).toMatchObject({ kind: "estimate", reason: "no_entries" });
    const p2 = await service.list(me, 99); // clamps to the last page
    expect(p2.page).toBe(2);
    expect(p2.items).toHaveLength(2);
  });

  it("saves notes only for the owner's own existing sessions", async () => {
    const { service } = build(daily);
    const id = `22202:${daily[3].matchId}`;
    const saved = await service.saveNote(me, id, input, new Date(T0));
    expect(saved).toMatchObject({
      ok: true,
      value: { sessionId: id, matchIds: [daily[3].matchId], sessionStartedAt: daily[3].startedAt },
    });
    expect((await service.detail(me, id))?.note?.goal).toBe("fewer deaths");

    // Another account's id, or a match that doesn't start a session, is not found.
    expect(await service.saveNote(me, `1:${daily[3].matchId}`, input)).toMatchObject({
      ok: false,
    });
    expect(await service.saveNote(me, "22202:123", input)).toMatchObject({ ok: false });
    expect(await service.detail({ userId: "u2", accountId32: 1 }, id)).toBeNull();
    expect((await service.detail({ userId: "u2", accountId32: 22202 }, id))?.note).toBeNull();
  });

  it("keeps a note visible after a new gap regroups its session", async () => {
    // Two games 90 minutes apart (end to start): separate at 60, merged at 120.
    const a = match(1, T0);
    const b = match(2, T0 + 120 * 60_000);
    const { service } = build([a, b]);
    const bId = `22202:${b.matchId}`;
    expect((await service.saveNote(me, bId, input)).ok).toBe(true);

    await service.setGap(me, 120);
    const page = await service.list(me, 1);
    expect(page.totalSessions).toBe(1);
    const mergedId = `22202:${a.matchId}`;
    expect(page.earlierNotes).toMatchObject([
      { note: { sessionId: bId }, currentSessionId: mergedId },
    ]);
    expect((await service.detail(me, mergedId))?.earlierNotes).toMatchObject([
      { sessionId: bId, goal: "fewer deaths" },
    ]);

    await service.setGap(me, 60);
    expect((await service.list(me, 1)).earlierNotes).toEqual([]);
    expect((await service.detail(me, bId))?.note?.note).toBe("calm");
  });
});
