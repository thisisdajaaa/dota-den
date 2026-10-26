import { describe, expect, it, vi } from "vitest";
import { SessionCompanionService } from "@/modules/sessions/companion.service";
import { gameNews, shouldCheck, type CompanionState } from "@/modules/sessions/domain/companion";
import type { SessionMatch } from "@/modules/sessions/domain/session";

const NOW = new Date("2026-10-26T14:00:00Z");
const min = (m: number) => new Date(NOW.getTime() - m * 60_000);

const match = (
  id: string,
  minutesAgo: number,
  result: "win" | "loss",
  heroId = 1,
): SessionMatch => ({
  matchId: id,
  startedAt: min(minutesAgo),
  durationSec: 30 * 60,
  heroId,
  result,
  kills: 1,
  deaths: 1,
  assists: 1,
  ranked: true,
  queueClass: "solo",
  partySize: 1,
});

/** A long history where losing two in a row is followed by a loss most of the time. */
function tiltyHistory(): SessionMatch[] {
  const out: SessionMatch[] = [];
  for (let s = 0; s < 40; s++) {
    // One session a day, long ago: W, W, L, L, then mostly L (3 of 4 sessions).
    const start = 60 * 24 * (s + 2);
    out.push(match(`h${s}a`, start, "win"), match(`h${s}b`, start - 40, "win"));
    out.push(match(`h${s}c`, start - 80, "loss"), match(`h${s}d`, start - 120, "loss"));
    out.push(match(`h${s}e`, start - 160, s % 4 === 0 ? "win" : "loss"));
  }
  return out;
}

describe("gameNews", () => {
  it("announces new games oldest first, with the session record up to each", () => {
    const matches = [match("1", 120, "win"), match("2", 80, "loss"), match("3", 40, "win")];
    const news = gameNews(matches, 60, min(100), NOW);
    expect(news.map((n) => [n.matchId, n.session])).toEqual([
      ["2", { wins: 1, losses: 1 }],
      ["3", { wins: 2, losses: 1 }],
    ]);
  });

  it("warns on a losing streak only when the player's own history backs it", () => {
    const now = [match("n1", 80, "loss", 2), match("n2", 40, "loss", 2)];
    const news = gameNews([...tiltyHistory(), ...now], 60, min(100), NOW);
    expect(news[1].tilt).toMatchObject({ streak: 2 });
    expect(news[0].tilt).toBeNull();
    // Without that history, no warning.
    expect(gameNews(now, 60, min(100), NOW)[1].tilt).toBeNull();
  });
});

describe("shouldCheck", () => {
  const s = (over: Partial<CompanionState> = {}): CompanionState => ({
    lastInGameAt: null,
    lastSyncAt: null,
    watermark: min(60),
    ...over,
  });
  it("checks while in Dota (and a while after), no more than every few minutes", () => {
    expect(shouldCheck(s(), true, NOW)).toBe(true);
    expect(shouldCheck(s({ lastSyncAt: min(2) }), true, NOW)).toBe(false);
    expect(shouldCheck(s({ lastInGameAt: min(20), lastSyncAt: min(5) }), false, NOW)).toBe(true);
    expect(shouldCheck(s({ lastInGameAt: min(45) }), false, NOW)).toBe(false);
    expect(shouldCheck(s(), false, NOW)).toBe(false);
  });
});

describe("SessionCompanionService", () => {
  function setup(opts: {
    inDota: boolean;
    state?: Partial<CompanionState>;
    matches?: SessionMatch[];
  }) {
    let state: CompanionState = {
      lastInGameAt: null,
      lastSyncAt: null,
      watermark: null,
      ...opts.state,
    };
    const sync = vi.fn(async () => {});
    const notify = vi.fn(async () => 1);
    const svc = new SessionCompanionService({
      players: async () => [{ userId: "u", accountId32: 7, steamId64: "76561197960265735" }],
      playing: async () => new Map([["76561197960265735", opts.inDota ? "570" : null]]),
      state: {
        get: async () => ({ ...state }),
        save: async (_u, s) => void (state = s),
        exportForOwner: async () => [],
        deleteForOwner: async () => 0,
      },
      sync,
      matches: async () => opts.matches ?? [],
      gapMinutes: async () => 60,
      notify,
      logger: { info: vi.fn(), warn: vi.fn() },
      now: () => NOW,
    });
    return { svc, sync, notify, state: () => state };
  }

  it("starts from now the first time, so nothing old is announced", async () => {
    const t = setup({ inDota: true, matches: [match("old", 30, "win")] });
    expect(await t.svc.run()).toMatchObject({ inDota: 1, checked: 1, announced: 0 });
    expect(t.state().watermark).toEqual(NOW);
    expect(t.notify).not.toHaveBeenCalled();
  });

  it("syncs a player in Dota and announces each new game once", async () => {
    const t = setup({
      inDota: true,
      state: { watermark: min(60) },
      matches: [match("a", 90, "win"), match("b", 40, "loss")],
    });
    expect(await t.svc.run()).toMatchObject({ announced: 1 });
    expect(t.sync).toHaveBeenCalledWith(7);
    expect(t.notify).toHaveBeenCalledWith(
      "u",
      expect.objectContaining({ matchId: "b", result: "loss" }),
    );
    expect(t.state().watermark).toEqual(min(40));
  });

  it("costs nothing for a player who isn't playing", async () => {
    const t = setup({
      inDota: false,
      state: { watermark: min(60) },
      matches: [match("b", 40, "loss")],
    });
    expect(await t.svc.run()).toMatchObject({ inDota: 0, checked: 0 });
    expect(t.sync).not.toHaveBeenCalled();
  });
});
