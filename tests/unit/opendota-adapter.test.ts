import { describe, expect, it, vi } from "vitest";
import { cdnImage, OpenDotaAdapter } from "@/modules/matches/infrastructure/opendota-adapter";
import { ProviderGateway } from "@/modules/shared/infrastructure/provider-gateway";
import { matchRow, PATCH_CONSTANTS } from "../fixtures/opendota";

const FETCHED_AT = new Date("2026-09-29T00:00:00Z");

function adapterWith(body: unknown, status = 200) {
  const fetch = vi.fn(async (_url: string) => new Response(JSON.stringify(body), { status }));
  const gateway = new ProviderGateway({
    name: "opendota",
    fetch,
    sleep: async () => {},
    maxRetries: 0,
  });
  return { adapter: new OpenDotaAdapter(gateway, { apiKey: "k", now: () => FETCHED_AT }), fetch };
}

describe("OpenDotaAdapter.fetchPlayerMatches", () => {
  it("translates rows into internal facts with provenance", async () => {
    const { adapter, fetch } = adapterWith([
      matchRow({ match_id: 111, player_slot: 130, radiant_win: true, version: 21 }),
    ]);
    const res = await adapter.fetchPlayerMatches(22202, { offset: 100, limit: 50 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.rejectedCount).toBe(0);
    expect(res.value.matches[0]).toMatchObject({
      accountId32: 22202,
      matchId: "111",
      side: "dire",
      result: "loss",
      startedAt: new Date("2026-05-01T18:00:00Z"),
      partySize: 1,
      role: null,
      provenance: { provider: "opendota", fetchedAt: FETCHED_AT, parseStatus: "parsed" },
    });

    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.pathname).toBe("/api/players/22202/matches");
    expect(url.searchParams.get("offset")).toBe("100");
    expect(url.searchParams.get("limit")).toBe("50");
    expect(url.searchParams.getAll("project")).toContain("party_size");
    expect(url.searchParams.get("api_key")).toBe("k");
  });

  it("keeps missing party_size as null rather than guessing", async () => {
    const row = matchRow();
    delete row.party_size;
    const { adapter } = adapterWith([row, matchRow({ party_size: null })]);
    const res = await adapter.fetchPlayerMatches(1, { offset: 0, limit: 100 });
    expect(res.ok && res.value.matches.map((m) => m.partySize)).toEqual([null, null]);
  });

  it("rejects malformed rows and counts them", async () => {
    const { adapter } = adapterWith([
      matchRow(),
      { match_id: "oops" },
      matchRow({ player_slot: 999 }),
    ]);
    const res = await adapter.fetchPlayerMatches(1, { offset: 0, limit: 100 });
    expect(res.ok && res.value).toMatchObject({ rejectedCount: 2 });
    expect(res.ok && res.value.matches).toHaveLength(1);
  });

  it("reports invalid payloads and upstream errors as typed errors", async () => {
    expect(
      await adapterWith({ error: "x" }).adapter.fetchPlayerMatches(1, { offset: 0, limit: 1 }),
    ).toMatchObject({
      ok: false,
      error: { type: "invalid_payload" },
    });
    expect(
      await adapterWith({}, 503).adapter.fetchPlayerMatches(1, { offset: 0, limit: 1 }),
    ).toMatchObject({
      ok: false,
      error: { type: "unavailable" },
    });
  });
});

describe("OpenDotaAdapter.fetchPlayerProfile", () => {
  it("maps profile and history availability", async () => {
    const { adapter } = adapterWith({
      profile: {
        account_id: 7,
        personaname: "Tester",
        avatarfull: "https://a/x.jpg",
        fh_unavailable: true,
      },
      rank_tier: 80,
      leaderboard_rank: 1053,
    });
    expect(await adapter.fetchPlayerProfile(7)).toEqual({
      ok: true,
      value: {
        accountId32: 7,
        personaName: "Tester",
        avatarUrl: "https://a/x.jpg",
        matchHistory: "limited",
        rankTier: 80,
        leaderboardRank: 1053,
      },
    });
  });

  it("treats a missing profile as not found", async () => {
    const { adapter } = adapterWith({ profile: null, rank_tier: null });
    expect(await adapter.fetchPlayerProfile(7)).toEqual({
      ok: false,
      error: { type: "not_found" },
    });
  });
});

describe("OpenDotaAdapter.getTimeline", () => {
  it("parses patch constants", async () => {
    const { adapter } = adapterWith(PATCH_CONSTANTS);
    const res = await adapter.getTimeline();
    expect(res.ok && res.value.map((p) => p.name)).toEqual(["7.40", "7.41"]);
  });
});

describe("OpenDotaAdapter.fetchMatch", () => {
  const base = {
    match_id: 123,
    start_time: 1_790_000_000,
    duration: 2000,
    radiant_win: false,
    radiant_score: 10,
    dire_score: 30,
    game_mode: 22,
    lobby_type: 7,
    region: 5,
    version: 22,
    radiant_gold_adv: [0, -500, -1500],
    radiant_xp_adv: [0, -200, -900],
  };
  const p = (slot: number, extra: Record<string, unknown> = {}) => ({
    player_slot: slot,
    account_id: 1000 + slot,
    personaname: `P${slot}`,
    hero_id: 1,
    item_0: 36,
    item_1: 0,
    item_neutral: null,
    ...extra,
  });

  it("reads replay laning for parsed players and leaves it null otherwise", async () => {
    const { adapter } = adapterWith({
      ...base,
      players: [
        p(0, {
          lane: 1,
          lane_role: 1,
          is_roaming: false,
          lane_efficiency_pct: 74,
          lh_t: Array.from({ length: 12 }, (_, m) => m * 5),
          dn_t: Array.from({ length: 12 }, () => 1),
          gold_t: Array.from({ length: 12 }, (_, m) => m * 400),
          obs_placed: 2,
          purchase_log: [{ time: 600, key: "power_treads" }],
        }),
        p(128),
      ],
    });
    const res = await adapter.fetchMatch("123");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.players[0].laning).toMatchObject({
      lane: 1,
      efficiencyPct: 74,
      lastHitsAt10: 50,
      deniesAt10: 1,
      goldAt10: 4_000,
      observers: 2,
      purchases: [{ time: 600, key: "power_treads" }],
    });
    expect(res.value.players[1].laning).toBeNull();
  });

  it("reads wards (with removals) and team fight deaths for parsed players", async () => {
    const { adapter } = adapterWith({
      ...base,
      players: [
        p(0, {
          lh_t: [0, 5],
          obs_log: [{ time: -26, x: 130, y: 118.3, ehandle: 7 }],
          obs_left_log: [{ time: 334, x: 130, y: 118.3, ehandle: 7 }],
          sen_log: [{ time: 400, x: 90, y: 100 }, { time: 410 }],
        }),
        p(128),
      ],
      teamfights: [
        { start: 370, players: [{ deaths_pos: { "169": { "126": 1 } } }, { deaths_pos: {} }] },
        { start: 900, players: [{}, { deaths_pos: { "100": { "100": 2 } } }] },
      ],
    });
    const res = await adapter.fetchMatch("123");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.players[0].map).toEqual({
      wards: [
        { kind: "observer", placedAt: -26, removedAt: 334, x: 130, y: 118.3 },
        { kind: "sentry", placedAt: 400, removedAt: null, x: 90, y: 100 },
      ],
      teamfightDeaths: [{ time: 370, x: 169, y: 126 }],
    });
    // Unparsed: no map, even when the match has team fights.
    expect(res.value.players[1].map).toBeNull();
  });

  it("keeps complete benchmarks for shown stats and tolerates odd ones", async () => {
    const { adapter } = adapterWith({
      ...base,
      players: [
        p(0, {
          benchmarks: {
            gold_per_min: { raw: 612, pct: 0.83, pct_bracket: 0.7 },
            last_hits_per_min: { raw: 8.4, pct: 0.97 },
            kills_per_min: { raw: 0.2, pct: 0.6 },
            tower_damage: { raw: null, pct: 0.1 },
          },
        }),
        p(128, { benchmarks: "garbage" }),
        p(129),
      ],
    });
    const res = await adapter.fetchMatch("123");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.players[0].benchmarks).toEqual({
      gold_per_min: { raw: 612, pct: 0.83, pctBracket: 0.7 },
      last_hits_per_min: { raw: 8.4, pct: 0.97, pctBracket: null },
    });
    expect(res.value.players[1].benchmarks).toBeNull();
    expect(res.value.players[2].benchmarks).toBeNull();
  });

  it("maps players, sides, empty slots and advantage series", async () => {
    const { adapter } = adapterWith({ ...base, players: [p(0), p(128)] });
    const res = await adapter.fetchMatch("123");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).toMatchObject({
      matchId: "123",
      radiantWin: false,
      parsed: true,
      goldAdvantage: [0, -500, -1500],
    });
    expect(res.value.players.map((x) => x.side)).toEqual(["radiant", "dire"]);
    expect(res.value.players[0].items.slice(0, 2)).toEqual([36, null]);
    expect(res.value.players[0].neutralItem).toBeNull();
  });

  it("never exposes identity for anonymous players", async () => {
    const { adapter } = adapterWith({
      ...base,
      players: [p(0, { account_id: 4294967295, personaname: "leak" }), p(1, { account_id: null })],
    });
    const res = await adapter.fetchMatch("123");
    expect(res.ok && res.value.players.map((x) => [x.accountId32, x.personaName])).toEqual([
      [null, null],
      [null, null],
    ]);
  });

  it("marks unparsed matches and drops missing advantage data", async () => {
    const { adapter } = adapterWith({
      ...base,
      version: null,
      radiant_gold_adv: null,
      radiant_xp_adv: undefined,
      players: [p(0, { net_worth: null, hero_damage: null })],
    });
    const res = await adapter.fetchMatch("123");
    expect(res.ok && res.value).toMatchObject({
      parsed: false,
      goldAdvantage: null,
      xpAdvantage: null,
    });
    expect(res.ok && res.value.players[0].heroDamage).toBeNull();
  });

  it("rejects non-numeric ids without calling upstream", async () => {
    const { adapter, fetch } = adapterWith({});
    expect(await adapter.fetchMatch("../players/1")).toEqual({
      ok: false,
      error: { type: "not_found" },
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("OpenDotaAdapter.getItems", () => {
  it("joins item ids to item metadata and strips cache-busting query strings", async () => {
    const fetch = vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url.includes("item_ids")
              ? { "36": "magic_wand", "999": "missing_item" }
              : {
                  magic_wand: {
                    id: 36,
                    img: "/apps/dota2/images/dota_react/items/magic_wand.png?t=1",
                    dname: "Magic Wand",
                    qual: "common",
                    cost: 450,
                  },
                },
          ),
        ),
    );
    const gateway = new ProviderGateway({
      name: "opendota",
      fetch,
      sleep: async () => {},
      maxRetries: 0,
    });
    const res = await new OpenDotaAdapter(gateway).getItems();
    expect(res).toEqual({
      ok: true,
      value: [
        {
          id: 36,
          key: "magic_wand",
          name: "Magic Wand",
          imageUrl:
            "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/magic_wand.png",
          qual: "common",
          cost: 450,
        },
      ],
    });
  });
});

describe("cdnImage", () => {
  it("allows only Dota CDN paths and strips query strings", () => {
    expect(cdnImage("/apps/dota2/images/dota_react/heroes/pudge.png?")).toBe(
      "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/pudge.png",
    );
    expect(cdnImage("https://evil.example/x.png")).toBeNull();
    expect(cdnImage("/apps/dota2/../../x.png?")).toBeNull();
    expect(cdnImage("/other/pudge.png")).toBeNull();
    expect(cdnImage(undefined)).toBeNull();
  });
});
