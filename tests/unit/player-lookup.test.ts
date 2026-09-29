import { describe, expect, it } from "vitest";
import {
  parseAccountId,
  parsePlayerQuery,
  steamId64ToAccountId,
} from "@/modules/players/domain/player-lookup";

const account = (accountId32: number, source: string) => ({
  ok: true,
  value: { kind: "account", accountId32, source },
});
const name = (q: string, vanity?: true) => ({
  ok: true,
  value: vanity ? { kind: "name", q, vanity } : { kind: "name", q },
});

describe("parsePlayerQuery", () => {
  it("reads plain account ids", () => {
    expect(parsePlayerQuery("22202")).toEqual(account(22202, "account_id"));
    expect(parsePlayerQuery("  86745912 ")).toEqual(account(86745912, "account_id"));
    expect(parsePlayerQuery("4294967295")).toEqual(account(4294967295, "account_id"));
  });

  it("converts SteamID64 with BigInt", () => {
    expect(parsePlayerQuery("76561197960287930")).toEqual(account(22202, "steam_id64"));
    expect(parsePlayerQuery("76561199999999999")).toEqual(account(2039734271, "steam_id64"));
  });

  it("reads Steam profile links with or without scheme/www/trailing parts", () => {
    for (const input of [
      "https://steamcommunity.com/profiles/76561197960287930",
      "https://steamcommunity.com/profiles/76561197960287930/",
      "http://www.steamcommunity.com/profiles/76561197960287930/games?tab=all",
      "steamcommunity.com/profiles/76561197960287930",
    ]) {
      expect(parsePlayerQuery(input)).toEqual(account(22202, "steam_profile_url"));
    }
  });

  it("reads Dotabuff and OpenDota player links", () => {
    expect(parsePlayerQuery("https://www.dotabuff.com/players/22202")).toEqual(
      account(22202, "dotabuff_url"),
    );
    expect(parsePlayerQuery("dotabuff.com/players/22202/matches?date=week")).toEqual(
      account(22202, "dotabuff_url"),
    );
    expect(parsePlayerQuery("https://www.opendota.com/players/22202/peers")).toEqual(
      account(22202, "opendota_url"),
    );
    expect(parsePlayerQuery("https://opendota.com/players/22202")).toEqual(
      account(22202, "opendota_url"),
    );
  });

  it("treats Steam custom URLs as a name search on the custom part", () => {
    expect(parsePlayerQuery("https://steamcommunity.com/id/SomeVanity/")).toEqual(
      name("SomeVanity", true),
    );
    expect(parsePlayerQuery("steamcommunity.com/id/caf%C3%A9")).toEqual(name("café", true));
  });

  it("falls back to a trimmed name search", () => {
    expect(parsePlayerQuery("  Fixture   Peer ")).toEqual(name("Fixture Peer"));
    expect(parsePlayerQuery("ab")).toEqual(name("ab"));
    // Too big to be an account id and not a SteamID64: someone's numeric name.
    expect(parsePlayerQuery("99999999999")).toEqual(name("99999999999"));
    expect(parsePlayerQuery("4294967296")).toEqual(name("4294967296"));
    // Links to other sites are just text.
    expect(parsePlayerQuery("https://example.com/players/22202")).toEqual(
      name("https://example.com/players/22202"),
    );
  });

  it("rejects bad input", () => {
    expect(parsePlayerQuery("")).toEqual({ ok: false, error: { type: "empty" } });
    expect(parsePlayerQuery("   ")).toEqual({ ok: false, error: { type: "empty" } });
    expect(parsePlayerQuery("a")).toEqual({ ok: false, error: { type: "too_short" } });
    expect(parsePlayerQuery("0")).toEqual({ ok: false, error: { type: "too_short" } });
    expect(parsePlayerQuery("x".repeat(65))).toEqual({ ok: false, error: { type: "too_long" } });
    // Out-of-range ids inside links are not guessed at.
    expect(parsePlayerQuery("dotabuff.com/players/0")).toEqual(name("dotabuff.com/players/0"));
  });

  it("counts characters, not UTF-16 units", () => {
    expect(parsePlayerQuery("😀".repeat(64)).ok).toBe(true);
    expect(parsePlayerQuery("😀")).toEqual({ ok: false, error: { type: "too_short" } });
  });
});

describe("account id helpers", () => {
  it("parseAccountId accepts 1..2^32-1 only", () => {
    expect(parseAccountId("1")).toBe(1);
    expect(parseAccountId(4294967295)).toBe(4294967295);
    expect(parseAccountId("0")).toBeNull();
    expect(parseAccountId("4294967296")).toBeNull();
    expect(parseAccountId("-1")).toBeNull();
    expect(parseAccountId("1e3")).toBeNull();
    expect(parseAccountId("12345678901")).toBeNull();
    expect(parseAccountId(1.5)).toBeNull();
  });

  it("steamId64ToAccountId rejects non-individual ids", () => {
    expect(steamId64ToAccountId("76561197960265728")).toBeNull(); // account 0
    expect(steamId64ToAccountId("76561202255233024")).toBeNull(); // 2^32
    expect(steamId64ToAccountId("12345678901234567")).toBeNull();
  });
});
