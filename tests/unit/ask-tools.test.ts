import { describe, expect, it } from "vitest";
import {
  ASK_TOOL_DEFINITIONS,
  AskRequestSchema,
  parseToolArgs,
} from "@/modules/assistant/schemas/ask-tools.schema";

describe("Ask Den tool arguments", () => {
  it("accepts valid calls, with defaults left to the tool", () => {
    expect(parseToolArgs("my_recent_games", '{"count":10,"hero":"Pudge"}')).toEqual({
      ok: true,
      name: "my_recent_games",
      args: { count: 10, hero: "Pudge" },
    });
    expect(parseToolArgs("my_sessions", "")).toMatchObject({ ok: true, args: {} });
    expect(parseToolArgs("meta_heroes", '{"position":5,"bracket":"mine"}')).toMatchObject({
      ok: true,
    });
    expect(parseToolArgs("ward_spots", '{"side":"dire","phase":"mid"}')).toMatchObject({
      ok: true,
    });
  });

  it("refuses unknown tools, bad JSON and out-of-range values", () => {
    expect(parseToolArgs("delete_account", "{}")).toMatchObject({ ok: false });
    expect(parseToolArgs("my_mmr", "{not json")).toEqual({
      ok: false,
      error: "arguments are not valid JSON",
    });
    expect(parseToolArgs("my_recent_games", '{"count":500}')).toMatchObject({ ok: false });
    expect(parseToolArgs("meta_heroes", '{"position":6}')).toMatchObject({ ok: false });
    expect(parseToolArgs("ward_spots", '{"side":"both","phase":"early"}')).toMatchObject({
      ok: false,
    });
    expect(parseToolArgs("match_summary", '{"match_id":"1; drop"}')).toMatchObject({ ok: false });
  });

  it("can't be pointed at another player: no tool takes an account, user or Steam id", () => {
    for (const [tool, args] of [
      ["my_recent_games", { account_id: 123 }],
      ["my_mmr", { userId: "someone-else" }],
      ["my_sessions", { steamId: "76561197960287930" }],
      ["my_hero_stats", { hero: "Pudge", accountId32: 1 }],
      ["match_summary", { match_id: "1", account_id: 2 }],
    ] as const) {
      expect(parseToolArgs(tool, JSON.stringify(args))).toMatchObject({ ok: false });
    }
    for (const def of ASK_TOOL_DEFINITIONS) {
      const props = Object.keys((def.parameters.properties ?? {}) as object);
      expect(props.some((p) => /account|user|steam|player/i.test(p))).toBe(false);
      expect(def.parameters.additionalProperties).toBe(false);
      expect(def.parameters.$schema).toBeUndefined();
    }
  });

  it("limits the question's length", () => {
    expect(AskRequestSchema.safeParse({ question: "  " }).success).toBe(false);
    expect(AskRequestSchema.safeParse({ question: "x".repeat(501) }).success).toBe(false);
    expect(AskRequestSchema.safeParse({ question: "Bakit?", matchId: "8000000001" }).success).toBe(
      true,
    );
  });
});

describe("Ask Den tool schemas sent to the model", () => {
  it("treat an empty match id as omitted", () => {
    expect(parseToolArgs("match_summary", '{"match_id":""}')).toEqual({
      ok: true,
      name: "match_summary",
      args: { match_id: undefined },
    });
  });
});
