import { describe, expect, it, vi } from "vitest";
import { OpenDotaAdapter } from "@/modules/matches/infrastructure/opendota-adapter";
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
      rank_tier: 54,
    });
    expect(await adapter.fetchPlayerProfile(7)).toEqual({
      ok: true,
      value: {
        accountId32: 7,
        personaName: "Tester",
        avatarUrl: "https://a/x.jpg",
        matchHistory: "limited",
        rankTier: 54,
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
