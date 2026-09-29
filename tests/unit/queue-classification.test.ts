import { describe, expect, it } from "vitest";
import { classifyQueue, isRanked } from "@/modules/matches/domain/queue-classification";

describe("classifyQueue", () => {
  it("labels party_size=1 in matchmaking as solo with high confidence", () => {
    expect(classifyQueue({ lobbyType: 7, partySize: 1 })).toEqual({
      queueClass: "solo",
      partySize: 1,
      confidence: "high",
      reason: "party_size_reported",
    });
  });

  it.each([2, 3, 4, 5])("labels party_size=%i as party", (partySize) => {
    expect(classifyQueue({ lobbyType: 0, partySize })).toMatchObject({
      queueClass: "party",
      partySize,
    });
  });

  it.each([
    [null, "party_size_missing"],
    [undefined, "party_size_missing"],
  ] as const)("never infers solo from a missing party size (%s)", (partySize, reason) => {
    expect(classifyQueue({ lobbyType: 7, partySize })).toEqual({
      queueClass: "unknown",
      partySize: null,
      confidence: "none",
      reason,
    });
  });

  it.each([0, 6, 10, 1.5, -1])("treats implausible party_size %s as unknown", (partySize) => {
    expect(classifyQueue({ lobbyType: 7, partySize })).toMatchObject({
      queueClass: "unknown",
      reason: "party_size_out_of_range",
    });
  });

  it("ignores party_size in practice lobbies, which report the whole lobby", () => {
    // Observed upstream: lobby_type 1 with party_size 10.
    expect(classifyQueue({ lobbyType: 1, partySize: 10 })).toMatchObject({
      queueClass: "unknown",
      reason: "non_matchmaking_lobby",
    });
    expect(classifyQueue({ lobbyType: 1, partySize: 1 })).toMatchObject({ queueClass: "unknown" });
  });

  it("is unknown when lobby type is missing", () => {
    expect(classifyQueue({ lobbyType: null, partySize: 1 })).toMatchObject({
      queueClass: "unknown",
      reason: "lobby_type_missing",
    });
  });
});

describe("isRanked", () => {
  it("recognises ranked lobby types only", () => {
    expect(isRanked(7)).toBe(true);
    expect(isRanked(0)).toBe(false);
    expect(isRanked(null)).toBe(false);
  });
});
