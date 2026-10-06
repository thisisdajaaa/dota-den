import { describe, expect, it } from "vitest";
import { ESTIMATE_PER_GAME } from "@/modules/mmr/domain/calendar";
import { groupSessions, type SessionMatch } from "@/modules/sessions/domain/session";
import { sessionMmr, type MmrObservation } from "@/modules/sessions/domain/session-mmr";

const T0 = Date.parse("2026-09-10T18:00:00Z");
const MIN = 60_000;
const at = (min: number) => new Date(T0 + min * MIN);

let seq = 0;
function match(startMin: number, over: Partial<SessionMatch> = {}): SessionMatch {
  seq++;
  return {
    matchId: String(9_000_000_000 + seq),
    startedAt: at(startMin),
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

/** Session of 3 ranked games (2 wins, 1 loss) from minute 0 to minute 100. */
function setup() {
  const games = [
    match(0, { result: "win" }),
    match(35, { result: "loss" }),
    match(70, { result: "win" }),
  ];
  const [session] = groupSessions(1, games, 60);
  return { games, session };
}

const obs = (min: number, mmr: number): MmrObservation => ({ observedAt: at(min), mmr });

function attribute(
  session: ReturnType<typeof setup>["session"],
  observations: MmrObservation[],
  others: SessionMatch[] = [],
) {
  const rankedGames = [...session.matches, ...others]
    .filter((m) => m.ranked)
    .map((m) => ({ matchId: m.matchId, startedAt: m.startedAt }));
  return sessionMmr({ session, observations, rankedGames, estimatePerGame: ESTIMATE_PER_GAME });
}

describe("sessionMmr", () => {
  it("uses the ±25 estimate from the MMR calendar rules", () => {
    expect(ESTIMATE_PER_GAME).toBe(25);
  });

  it("is exact when entries bracket the session with no other ranked games between", () => {
    const { session } = setup();
    const res = attribute(session, [obs(-600, 4900), obs(-5, 5000), obs(120, 5030)]);
    expect(res).toEqual({
      kind: "exact",
      delta: 30,
      from: obs(-5, 5000),
      to: obs(120, 5030),
    });
  });

  it("accepts entries exactly at the session start and exactly at its end", () => {
    const { session } = setup();
    // Session ends at minute 100 (last game 70 + 30).
    expect(attribute(session, [obs(0, 5000), obs(100, 4975)])).toMatchObject({
      kind: "exact",
      delta: -25,
    });
  });

  it("falls back to a labelled estimate without any entries", () => {
    const { session } = setup();
    expect(attribute(session, [])).toEqual({
      kind: "estimate",
      delta: 25, // 2 wins − 1 loss
      rankedGames: 3,
      perGame: 25,
      reason: "no_entries",
    });
  });

  it("is an estimate when the only entries are inside the session", () => {
    const { session } = setup();
    expect(attribute(session, [obs(30, 5000), obs(60, 5025)])).toMatchObject({
      kind: "estimate",
      reason: "not_bracketed",
    });
  });

  it("is an estimate when entries exist on only one side", () => {
    const { session } = setup();
    expect(attribute(session, [obs(-10, 5000)])).toMatchObject({ reason: "not_bracketed" });
    expect(attribute(session, [obs(200, 5000)])).toMatchObject({ reason: "not_bracketed" });
  });

  it("still uses the bracketing entries when extra entries sit inside the session", () => {
    const { session } = setup();
    expect(attribute(session, [obs(-5, 5000), obs(50, 5010), obs(110, 5050)])).toMatchObject({
      kind: "exact",
      delta: 50,
    });
  });

  it("is an estimate when another ranked game falls between the entries", () => {
    const { session } = setup();
    const before = match(-120); // earlier session, after the first entry
    const after = match(300); // later session, before the closing entry
    expect(attribute(session, [obs(-200, 5000), obs(120, 5050)], [before])).toMatchObject({
      kind: "estimate",
      reason: "other_games_between",
    });
    expect(attribute(session, [obs(-5, 5000), obs(400, 5050)], [after])).toMatchObject({
      kind: "estimate",
      reason: "other_games_between",
    });
  });

  it("counts a game that starts at the same instant as an entry as after that entry", () => {
    const { session } = setup();
    const earlier = match(-100);
    expect(attribute(session, [obs(-100, 5000), obs(120, 5050)], [earlier])).toMatchObject({
      reason: "other_games_between",
    });
  });

  it("ignores unranked games for both the check and the estimate", () => {
    const games = [match(0, { result: "win" }), match(35, { result: "loss", ranked: false })];
    const [session] = groupSessions(1, games, 60);
    const unrankedBetween = match(-60, { ranked: false });
    expect(attribute(session, [], [unrankedBetween])).toMatchObject({ delta: 25, rankedGames: 1 });
    expect(attribute(session, [obs(-120, 5000), obs(90, 5025)], [unrankedBetween])).toMatchObject({
      kind: "exact",
      delta: 25,
    });
  });

  it("attributes nothing to a session without ranked games", () => {
    const [session] = groupSessions(1, [match(0, { ranked: false })], 60);
    expect(attribute(session, [obs(-5, 5000), obs(60, 5100)])).toEqual({ kind: "none" });
  });
});
