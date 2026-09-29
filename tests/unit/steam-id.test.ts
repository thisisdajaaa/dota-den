import { describe, expect, it } from "vitest";
import {
  parseAccountId32,
  parseSteamId64,
  toAccountId32,
  toSteamId64,
  type SteamId64,
} from "@/modules/identity/domain/steam-id";

describe("SteamID conversion", () => {
  it("converts SteamID64 to account ID using exact integer arithmetic", () => {
    // 76561197960287930 is Gabe Newell's public SteamID64 → account 22202.
    expect(toAccountId32("76561197960287930" as SteamId64)).toBe(22202);
  });

  it("round-trips the maximum account ID without float precision loss", () => {
    const max = parseAccountId32(4294967295);
    expect(max.ok).toBe(true);
    if (!max.ok) return;
    const id64 = toSteamId64(max.value);
    expect(id64).toBe("76561202255233023");
    expect(toAccountId32(id64)).toBe(4294967295);
    // Floating point would get this wrong:
    expect(Number("76561202255233023") - 76561197960265728).not.toBe(4294967295);
  });

  it.each([
    "",
    "abc",
    "7656119796028793",
    "765611979602879300",
    "12345678901234567",
    " 7656119796028793x",
  ])("rejects invalid SteamID64 %j", (input) => {
    expect(parseSteamId64(input).ok).toBe(false);
  });

  it("rejects SteamID64 values below the individual-account base", () => {
    expect(parseSteamId64("76561190000000000").ok).toBe(false);
  });

  it("trims whitespace", () => {
    expect(parseSteamId64(" 76561197960287930 ")).toEqual({ ok: true, value: "76561197960287930" });
  });

  it("rejects account IDs above 32 bits", () => {
    expect(parseAccountId32("4294967296").ok).toBe(false);
    expect(parseAccountId32("-1").ok).toBe(false);
  });
});
