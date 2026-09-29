import { err, ok, type Result } from "@/modules/shared/domain/result";

/**
 * SteamID64 for an individual account in the public universe.
 * Conversion uses BigInt only — SteamID64 exceeds Number.MAX_SAFE_INTEGER.
 */
const STEAM_ID64_BASE = 76561197960265728n;
const ACCOUNT_ID_MAX = 0xffffffffn;
const STEAM_ID64_PATTERN = /^7656119\d{10}$/;

declare const brand: unique symbol;
export type SteamId64 = string & { readonly [brand]: "SteamId64" };
export type AccountId32 = number & { readonly [brand]: "AccountId32" };

export type SteamIdError = { type: "invalid_steam_id"; input: string };

export function parseSteamId64(input: string): Result<SteamId64, SteamIdError> {
  const trimmed = input.trim();
  if (!STEAM_ID64_PATTERN.test(trimmed)) return err({ type: "invalid_steam_id", input });
  const offset = BigInt(trimmed) - STEAM_ID64_BASE;
  if (offset < 0n || offset > ACCOUNT_ID_MAX) return err({ type: "invalid_steam_id", input });
  return ok(trimmed as SteamId64);
}

export function parseAccountId32(input: string | number): Result<AccountId32, SteamIdError> {
  const s = String(input).trim();
  if (!/^\d{1,10}$/.test(s)) return err({ type: "invalid_steam_id", input: s });
  const n = BigInt(s);
  if (n > ACCOUNT_ID_MAX) return err({ type: "invalid_steam_id", input: s });
  return ok(Number(n) as AccountId32);
}

export function toAccountId32(id: SteamId64): AccountId32 {
  return Number(BigInt(id) - STEAM_ID64_BASE) as AccountId32;
}

export function toSteamId64(accountId: AccountId32): SteamId64 {
  return (BigInt(accountId) + STEAM_ID64_BASE).toString() as SteamId64;
}
