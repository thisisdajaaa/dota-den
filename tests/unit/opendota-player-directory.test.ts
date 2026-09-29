import { describe, expect, it, vi } from "vitest";
import {
  OpenDotaPlayerDirectory,
  steamAvatar,
} from "@/modules/players/infrastructure/opendota-player-directory";
import { topHeroes, topTeammates } from "@/modules/players/domain/public-player";
import { ProviderGateway } from "@/modules/shared/infrastructure/provider-gateway";
import { heroRow, peerRow, searchRow } from "../fixtures/opendota";

function directoryWith(body: unknown, status = 200) {
  const fetch = vi.fn(async (_url: string) => new Response(JSON.stringify(body), { status }));
  const gateway = new ProviderGateway({
    name: "opendota",
    fetch,
    sleep: async () => {},
    maxRetries: 0,
  });
  return {
    directory: new OpenDotaPlayerDirectory(gateway, {
      apiKey: "k",
      baseUrl: "http://fixture.test/api",
    }),
    fetch,
  };
}

describe("OpenDotaPlayerDirectory.search", () => {
  it("maps rows and skips malformed ones", async () => {
    const { directory, fetch } = directoryWith([
      searchRow(),
      searchRow({ account_id: 7, personaname: "", avatarfull: "https://evil.test/a.jpg" }),
      searchRow({ account_id: 8, last_match_time: null }),
      { account_id: "nope" },
      searchRow({ account_id: 0 }),
      searchRow({ account_id: 4294967296 }),
      null,
    ]);
    const res = await directory.search("Synthetic Searcher");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).toEqual([
      {
        accountId32: 31337,
        personaName: "Synthetic Searcher",
        avatarUrl: "https://avatars.steamstatic.com/0123456789abcdef_full.jpg",
        lastMatchAt: new Date("2026-09-27T12:00:00.000Z"),
      },
      // Empty names become null; avatars from other hosts are dropped.
      { accountId32: 7, personaName: null, avatarUrl: null, lastMatchAt: expect.any(Date) },
      {
        accountId32: 8,
        personaName: "Synthetic Searcher",
        avatarUrl: expect.any(String),
        lastMatchAt: null,
      },
    ]);
    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe("http://fixture.test/api/search");
    expect(url.searchParams.get("q")).toBe("Synthetic Searcher");
    expect(url.searchParams.get("api_key")).toBe("k");
  });

  it("rejects a non-array body and surfaces upstream errors", async () => {
    expect(await directoryWith({ error: "x" }).directory.search("ab")).toEqual({
      ok: false,
      error: { type: "invalid_payload", cause: "expected array" },
    });
    expect(await directoryWith({}, 429).directory.search("ab")).toMatchObject({
      ok: false,
      error: { type: "rate_limited" },
    });
    expect(await directoryWith({}, 500).directory.search("ab")).toMatchObject({
      ok: false,
      error: { type: "unavailable" },
    });
  });

  it("caches repeat lookups", async () => {
    const { directory, fetch } = directoryWith([searchRow()]);
    await directory.search("same");
    await directory.search("same");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("OpenDotaPlayerDirectory.winLoss", () => {
  it("maps win/lose", async () => {
    const { directory, fetch } = directoryWith({ win: 120, lose: 100 });
    expect(await directory.winLoss(22202)).toEqual({ ok: true, value: { wins: 120, losses: 100 } });
    expect(new URL(fetch.mock.calls[0][0]).pathname).toBe("/api/players/22202/wl");
  });

  it("rejects malformed payloads", async () => {
    for (const body of [{ win: -1, lose: 0 }, { win: "3", lose: 1 }, [], null]) {
      expect(await directoryWith(body).directory.winLoss(1)).toEqual({
        ok: false,
        error: { type: "invalid_payload", cause: "wl" },
      });
    }
  });
});

describe("OpenDotaPlayerDirectory.heroes", () => {
  it("maps rows, accepts string hero ids and skips bad rows", async () => {
    const { directory } = directoryWith([
      heroRow(),
      heroRow({ hero_id: "1", games: 10, win: 12, last_played: 0 }),
      heroRow({ hero_id: "abc" }),
      heroRow({ games: -1 }),
      heroRow({ hero_id: 0 }),
    ]);
    const res = await directory.heroes(22202);
    expect(res).toEqual({
      ok: true,
      value: [
        { heroId: 14, games: 40, wins: 22, lastPlayedAt: new Date("2026-09-28T12:00:00Z") },
        // Impossible win counts are clamped, never shown above 100%.
        { heroId: 1, games: 10, wins: 10, lastPlayedAt: null },
      ],
    });
  });

  it("topHeroes keeps played heroes, most games first", () => {
    const top = topHeroes(
      [
        { heroId: 1, games: 3, wins: 1, lastPlayedAt: null },
        { heroId: 2, games: 0, wins: 0, lastPlayedAt: null },
        { heroId: 3, games: 9, wins: 4, lastPlayedAt: null },
      ],
      8,
    );
    expect(top.map((h) => h.heroId)).toEqual([3, 1]);
  });
});

describe("OpenDotaPlayerDirectory.peers", () => {
  it("maps together/against stats and skips malformed rows", async () => {
    const { directory, fetch } = directoryWith([
      peerRow(),
      peerRow({ account_id: 40_002, personaname: null, avatarfull: null, with_games: 0 }),
      peerRow({ account_id: "x" }),
      peerRow({ account_id: 40_003, with_win: 9, with_games: 5 }),
    ]);
    const res = await directory.peers(22202);
    expect(new URL(fetch.mock.calls[0][0]).pathname).toBe("/api/players/22202/peers");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value[0]).toEqual({
      accountId32: 40001,
      personaName: "Synthetic Teammate",
      avatarUrl: "https://avatars.steamstatic.com/fedcba9876543210_full.jpg",
      withGames: 54,
      withWins: 28,
      againstGames: 6,
      againstWins: 2,
      lastPlayedAt: new Date("2026-09-28T12:00:00Z"),
    });
    expect(res.value[1]).toMatchObject({ accountId32: 40002, personaName: null, avatarUrl: null });
    expect(res.value[2]).toMatchObject({ accountId32: 40003, withWins: 5, withGames: 5 });

    // "Plays with" = teammates only, most games together first.
    expect(topTeammates(res.value, 10).map((p) => p.accountId32)).toEqual([40001, 40003]);
  });
});

describe("OpenDotaPlayerDirectory.lastMatchAt", () => {
  it("returns the newest match start or null", async () => {
    const { directory, fetch } = directoryWith([{ start_time: 1_790_000_000 }]);
    expect(await directory.lastMatchAt(5)).toEqual({
      ok: true,
      value: new Date(1_790_000_000_000),
    });
    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.searchParams.get("limit")).toBe("1");
    expect(url.searchParams.get("project")).toBe("start_time");
    expect(await directoryWith([]).directory.lastMatchAt(5)).toEqual({ ok: true, value: null });
  });
});

describe("steamAvatar", () => {
  it("only allows Steam's avatar CDN over https", () => {
    expect(steamAvatar("https://avatars.steamstatic.com/a_full.jpg")).toBe(
      "https://avatars.steamstatic.com/a_full.jpg",
    );
    expect(steamAvatar("http://avatars.steamstatic.com/a_full.jpg")).toBeNull();
    expect(steamAvatar("https://avatars.steamstatic.com.evil.test/a.jpg")).toBeNull();
    expect(steamAvatar("https://user@avatars.steamstatic.com/a.jpg")).toBeNull();
    expect(steamAvatar("not a url")).toBeNull();
    expect(steamAvatar(null)).toBeNull();
  });
});
