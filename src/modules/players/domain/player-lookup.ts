import { err, ok, type Result } from "@/common/result";

/**
 * Turns whatever someone pastes into the player search box into either a direct account
 * lookup or a name search. Pure; no network. SteamID64 conversion uses BigInt only
 * (SteamID64 exceeds Number.MAX_SAFE_INTEGER), mirroring identity's steam-id rules without
 * importing another context's domain.
 */
export const ACCOUNT_ID_MIN = 1;
export const ACCOUNT_ID_MAX = 4_294_967_295; // 2^32 - 1
export const NAME_QUERY_MIN = 2;
export const NAME_QUERY_MAX = 64;

const STEAM_ID64_BASE = 76561197960265728n;
const STEAM_ID64_PATTERN = /^7656119\d{10}$/;

export type PlayerLookup =
  | {
      kind: "account";
      accountId32: number;
      source: "account_id" | "steam_id64" | "steam_profile_url" | "dotabuff_url" | "opendota_url";
    }
  | {
      kind: "name";
      q: string;
      /**
       * Set when the input was a Steam custom URL (steamcommunity.com/id/<name>). Resolving
       * those needs the Steam Web API, so we search for the name part instead.
       */
      vanity?: true;
    };

export type LookupError = { type: "empty" } | { type: "too_short" } | { type: "too_long" };

/** Account ids are 32-bit and never 0. Accepts a number or a digit-only string. */
export function parseAccountId(input: string | number): number | null {
  const s = String(input).trim();
  if (!/^\d{1,10}$/.test(s)) return null;
  const n = Number(s);
  return n >= ACCOUNT_ID_MIN && n <= ACCOUNT_ID_MAX ? n : null;
}

/** SteamID64 (string) → 32-bit account id, or null when it isn't an individual account. */
export function steamId64ToAccountId(input: string): number | null {
  const s = input.trim();
  if (!STEAM_ID64_PATTERN.test(s)) return null;
  const offset = BigInt(s) - STEAM_ID64_BASE;
  if (offset < BigInt(ACCOUNT_ID_MIN) || offset > BigInt(ACCOUNT_ID_MAX)) return null;
  return Number(offset);
}

const URL_PATTERNS: Array<{
  re: RegExp;
  source: Extract<PlayerLookup, { kind: "account" }>["source"];
  steamId64?: true;
}> = [
  {
    re: /^steamcommunity\.com\/profiles\/(\d{17})(?:[/?#].*)?$/i,
    source: "steam_profile_url",
    steamId64: true,
  },
  { re: /^dotabuff\.com\/players\/(\d{1,10})(?:[/?#].*)?$/i, source: "dotabuff_url" },
  { re: /^opendota\.com\/players\/(\d{1,10})(?:[/?#].*)?$/i, source: "opendota_url" },
];

const VANITY = /^steamcommunity\.com\/id\/([^/?#]+)(?:[/?#].*)?$/i;

/** Strip scheme and leading "www." so "https://www.dotabuff.com/…" and "dotabuff.com/…" match alike. */
function hostPath(input: string): string {
  return input.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function nameLookup(raw: string, vanity?: true): Result<PlayerLookup, LookupError> {
  const q = raw.trim().replace(/\s+/g, " ");
  const length = [...q].length;
  if (length === 0) return err({ type: "empty" });
  if (length < NAME_QUERY_MIN) return err({ type: "too_short" });
  if (length > NAME_QUERY_MAX) return err({ type: "too_long" });
  return ok(vanity ? { kind: "name", q, vanity } : { kind: "name", q });
}

export function parsePlayerQuery(input: string): Result<PlayerLookup, LookupError> {
  const trimmed = input.trim();
  if (!trimmed) return err({ type: "empty" });

  // Plain numbers: a 32-bit account id, or a SteamID64.
  if (/^\d+$/.test(trimmed)) {
    const accountId32 = parseAccountId(trimmed);
    if (accountId32 !== null) return ok({ kind: "account", accountId32, source: "account_id" });
    const fromSteam = steamId64ToAccountId(trimmed);
    if (fromSteam !== null)
      return ok({ kind: "account", accountId32: fromSteam, source: "steam_id64" });
    // Some players really are named with digits; fall through to a name search.
    return nameLookup(trimmed);
  }

  const path = hostPath(trimmed);
  for (const { re, source, steamId64 } of URL_PATTERNS) {
    const m = re.exec(path);
    if (!m) continue;
    const accountId32 = steamId64 ? steamId64ToAccountId(m[1]) : parseAccountId(m[1]);
    if (accountId32 !== null) return ok({ kind: "account", accountId32, source });
  }

  const vanity = VANITY.exec(path);
  if (vanity) return nameLookup(safeDecode(vanity[1]), true);

  return nameLookup(trimmed);
}
