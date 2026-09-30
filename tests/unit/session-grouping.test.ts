import { describe, expect, it } from "vitest";
import {
  DEFAULT_GAP_MINUTES,
  gameScore,
  groupSessions,
  isGapMinutes,
  parseSessionId,
  sessionIdFromParam,
  type SessionMatch,
} from "@/modules/sessions/domain/session";
import { placeEarlierNotes, type SessionNote } from "@/modules/sessions/domain/session-note";

const T0 = Date.parse("2026-09-01T18:00:00Z");
const MIN = 60_000;

let seq = 0;
function match(startMin: number, over: Partial<SessionMatch> = {}): SessionMatch {
  seq++;
  return {
    matchId: String(8_000_000_000 + seq),
    startedAt: new Date(T0 + startMin * MIN),
    durationSec: 30 * 60,
    heroId: 1,
    result: "win",
    kills: 5,
    deaths: 5,
    assists: 5,
    ranked: true,
    queueClass: "solo",
    partySize: 1,
    ...over,
  };
}

describe("groupSessions", () => {
  it("defaults to a 60 minute gap and only allows the offered options", () => {
    expect(DEFAULT_GAP_MINUTES).toBe(60);
    expect([30, 60, 90, 120].every(isGapMinutes)).toBe(true);
    expect(isGapMinutes(45)).toBe(false);
    expect(isGapMinutes("60")).toBe(false);
  });

  it("measures the gap from the previous match's END, not its start", () => {
    // Game 1: 0–30 min. Game 2 starts at 100 → 70 min after game 1 ended (> 60).
    expect(groupSessions(1, [match(0), match(100)], 60)).toHaveLength(2);
    // Game 2 starts at 85 → 55 min after the end (it would be 85 measured from the start).
    expect(groupSessions(1, [match(0), match(85)], 60)).toHaveLength(1);
  });

  it("keeps a break of exactly the gap in the same session and splits one second later", () => {
    const exact = [match(0), match(90)]; // 30-min game, next starts 60 min after it ended
    expect(groupSessions(1, exact, 60)).toHaveLength(1);

    const late = { ...match(90), startedAt: new Date(T0 + 90 * MIN + 1000) };
    expect(groupSessions(1, [match(0), late], 60)).toHaveLength(2);
  });

  it("respects the configured gap", () => {
    const ms = [match(0), match(75), match(200)]; // breaks of 45 and 95 min
    expect(groupSessions(1, ms, 30)).toHaveLength(3);
    expect(groupSessions(1, ms, 60)).toHaveLength(2);
    expect(groupSessions(1, ms, 120)).toHaveLength(1);
  });

  it("sorts unsorted input and returns sessions oldest first with stable ids", () => {
    const first = match(0);
    const second = match(40);
    const later = match(24 * 60);
    const sessions = groupSessions(22202, [later, second, first], 60);
    expect(sessions.map((s) => s.matches.map((m) => m.matchId))).toEqual([
      [first.matchId, second.matchId],
      [later.matchId],
    ]);
    expect(sessions[0].id).toBe(`22202:${first.matchId}`);
    expect(parseSessionId(sessions[0].id)).toEqual({
      accountId32: 22202,
      firstMatchId: first.matchId,
    });
    // Raw timestamps untouched; end = last start + duration.
    expect(sessions[0].startedAt).toBe(first.startedAt);
    expect(sessions[0].endedAt).toEqual(new Date(T0 + 70 * MIN));
  });

  it("uses the latest end so far when a long game overlaps a shorter one", () => {
    const long = match(0, { durationSec: 120 * 60 }); // ends at 120
    const short = match(10, { durationSec: 10 * 60 }); // ends at 20
    const next = match(170); // 50 min after the long game ended
    expect(groupSessions(1, [long, short, next], 60)).toHaveLength(1);
  });

  it("returns nothing for no matches", () => {
    expect(groupSessions(1, [], 60)).toEqual([]);
  });

  it("reads session ids from URL segments, encoded or not", () => {
    expect(sessionIdFromParam("22202%3A7000000001")).toBe("22202:7000000001");
    expect(sessionIdFromParam("22202:7000000001")).toBe("22202:7000000001");
    expect(sessionIdFromParam("%E0%A4%A")).toBeNull();
    expect(sessionIdFromParam("..%2Fx")).toBeNull();
  });

  it("rejects malformed session ids", () => {
    for (const bad of ["abc", "1:2:3", "1:", ":5", "1:2x"]) expect(parseSessionId(bad)).toBeNull();
  });
});

describe("session stats", () => {
  it("counts record, ranked record, queue mix, heroes, time and streaks", () => {
    const ms = [
      match(0, { result: "win", heroId: 1, queueClass: "solo" }),
      match(35, { result: "win", heroId: 2, queueClass: "party", partySize: 2 }),
      match(70, { result: "loss", heroId: 1, queueClass: "unknown", partySize: null }),
      match(105, { result: "loss", heroId: 1, ranked: false }),
      match(140, { result: "loss", heroId: 3 }),
      match(175, { result: "win", heroId: 2, durationSec: 40 * 60 }),
    ];
    const [s] = groupSessions(1, ms, 60);
    expect(s.stats).toMatchObject({
      games: 6,
      wins: 3,
      losses: 3,
      ranked: { games: 5, wins: 3, losses: 2 },
      queue: { solo: 4, party: 1, unknown: 1 },
      playSec: (5 * 30 + 40) * 60,
      spanSec: (175 + 40) * 60,
      longestWinStreak: 2,
      longestLossStreak: 3,
    });
    // Most played first; equal counts → most recently played first.
    expect(s.stats.heroes).toEqual([
      { heroId: 1, games: 3, wins: 1 },
      { heroId: 2, games: 2, wins: 2 },
      { heroId: 3, games: 1, wins: 0 },
    ]);
  });

  it("never counts a missing party size as solo", () => {
    const [s] = groupSessions(1, [match(0, { queueClass: "unknown", partySize: null })], 60);
    expect(s.stats.queue).toEqual({ solo: 0, party: 0, unknown: 1 });
  });
});

describe("best and worst game rule (K+A−D)", () => {
  it("picks the win with the highest K+A−D and the loss with the lowest", () => {
    const okWin = match(0, { result: "win", kills: 5, assists: 5, deaths: 5 }); // 5
    const bigWin = match(35, { result: "win", kills: 10, assists: 12, deaths: 2 }); // 20
    const badLoss = match(70, { result: "loss", kills: 1, assists: 2, deaths: 12 }); // −9
    const okLoss = match(105, { result: "loss", kills: 6, assists: 6, deaths: 4 }); // 8
    // A loss with a great score is never the best game.
    const flashyLoss = match(140, { result: "loss", kills: 30, assists: 30, deaths: 0 });
    const [s] = groupSessions(1, [okWin, bigWin, badLoss, okLoss, flashyLoss], 60);
    expect(s.stats.best).toEqual({ match: bigWin, score: 20 });
    expect(s.stats.worst).toEqual({ match: badLoss, score: -9 });
    expect(gameScore(flashyLoss)).toBe(60);
  });

  it("breaks ties with the earlier game and returns null without wins or losses", () => {
    const a = match(0, { result: "win", kills: 5, assists: 5, deaths: 0 });
    const b = match(35, { result: "win", kills: 0, assists: 10, deaths: 0 });
    const [s] = groupSessions(1, [b, a], 60);
    expect(s.stats.best?.match).toBe(a);
    expect(s.stats.worst).toBeNull();

    const c = match(0, { result: "loss", kills: 0, assists: 0, deaths: 4 });
    const d = match(35, { result: "loss", kills: 1, assists: 1, deaths: 6 });
    const [lossesOnly] = groupSessions(1, [d, c], 60);
    expect(lossesOnly.stats.best).toBeNull();
    expect(lossesOnly.stats.worst?.match).toBe(c);
  });
});

describe("placeEarlierNotes", () => {
  const note = (sessionId: string, over: Partial<SessionNote> = {}): SessionNote => ({
    userId: "u",
    accountId32: 1,
    sessionId,
    matchIds: [],
    sessionStartedAt: new Date(T0),
    note: "keep calm",
    goal: "",
    goalMet: null,
    updatedAt: new Date(T0),
    ...over,
  });

  it("keeps notes whose session was regrouped and points them at the session holding their first match", () => {
    const a = match(0);
    const b = match(75); // 45 min break
    const split = groupSessions(1, [a, b], 30); // two sessions
    const merged = groupSessions(1, [a, b], 60); // one session starting with a
    const onSecond = note(split[1].id);

    expect(placeEarlierNotes([onSecond], split)).toEqual([]);
    expect(placeEarlierNotes([onSecond], merged)).toEqual([
      { note: onSecond, currentSessionId: merged[0].id },
    ]);
  });

  it("reports notes whose games are no longer imported and skips empty notes", () => {
    const sessions = groupSessions(1, [match(0)], 60);
    const gone = note("1:123");
    const empty = note("1:456", { note: "", goal: "" });
    expect(placeEarlierNotes([gone, empty], sessions)).toEqual([
      { note: gone, currentSessionId: null },
    ]);
  });
});
