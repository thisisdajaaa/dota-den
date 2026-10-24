import { err, ok, type Result } from "@/common/result";
import { parseSteamId64, type SteamId64 } from "../domain/steam-id";
import type { IdentityProvider, IdentityVerificationError, NonceStore } from "../identity.ports";

export const STEAM_OPENID_ENDPOINT = "https://steamcommunity.com/openid/login";
const OPENID_NS = "http://specs.openid.net/auth/2.0";
const IDENTIFIER_SELECT = "http://specs.openid.net/auth/2.0/identifier_select";
const CLAIMED_ID_PATTERN = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;
const REQUIRED_SIGNED = [
  "op_endpoint",
  "claimed_id",
  "identity",
  "return_to",
  "response_nonce",
  "assoc_handle",
];
export const NONCE_MAX_AGE_MS = 5 * 60 * 1000;
const CLOCK_SKEW_MS = 60 * 1000;

type FetchFn = (input: string, init: RequestInit) => Promise<Response>;

export interface SteamOpenIdProviderDeps {
  nonces: NonceStore;
  fetch?: FetchFn;
  now?: () => Date;
  timeoutMs?: number;
}

/** Steam OpenID 2.0 relying party (stateless check_authentication mode). See ADR 0001. */
export class SteamOpenIdProvider implements IdentityProvider {
  private readonly fetchFn: FetchFn;
  private readonly now: () => Date;

  constructor(private readonly deps: SteamOpenIdProviderDeps) {
    this.fetchFn = deps.fetch ?? ((input, init) => fetch(input, init));
    this.now = deps.now ?? (() => new Date());
  }

  buildAuthorizationUrl({ returnTo, realm }: { returnTo: string; realm: string }): string {
    const url = new URL(STEAM_OPENID_ENDPOINT);
    url.search = new URLSearchParams({
      "openid.ns": OPENID_NS,
      "openid.mode": "checkid_setup",
      "openid.return_to": returnTo,
      "openid.realm": realm,
      "openid.identity": IDENTIFIER_SELECT,
      "openid.claimed_id": IDENTIFIER_SELECT,
    }).toString();
    return url.toString();
  }

  async verifyCallback({
    params,
    expectedReturnTo,
  }: {
    params: URLSearchParams;
    expectedReturnTo: string;
  }): Promise<Result<SteamId64, IdentityVerificationError>> {
    // Every check below reads one value per field, and Steam verifies the same values: a
    // repeated field could let Steam vouch for one value while we accept another (sign-in as
    // someone else), so a callback that repeats any openid.* field is refused outright.
    const seen = new Set<string>();
    for (const key of params.keys()) {
      if (!key.startsWith("openid.")) continue;
      if (seen.has(key)) return err({ type: "duplicate_parameter", key });
      seen.add(key);
    }

    const mode = params.get("openid.mode");
    if (mode !== "id_res") return err({ type: "not_positive_assertion", mode });

    if (params.get("openid.ns") !== OPENID_NS) return err({ type: "not_positive_assertion", mode });
    if (params.get("openid.op_endpoint") !== STEAM_OPENID_ENDPOINT) {
      return err({ type: "invalid_op_endpoint" });
    }
    if (params.get("openid.return_to") !== expectedReturnTo) {
      return err({ type: "return_to_mismatch" });
    }

    const signed = new Set((params.get("openid.signed") ?? "").split(","));
    const missing = REQUIRED_SIGNED.filter((f) => !signed.has(f));
    if (missing.length > 0) return err({ type: "missing_signed_fields", missing });

    const claimedId = params.get("openid.claimed_id") ?? "";
    const match = CLAIMED_ID_PATTERN.exec(claimedId);
    if (!match || params.get("openid.identity") !== claimedId) {
      return err({ type: "invalid_claimed_id" });
    }
    const steamId = parseSteamId64(match[1]);
    if (!steamId.ok) return err({ type: "invalid_claimed_id" });

    const nonce = params.get("openid.response_nonce") ?? "";
    const issuedAt = parseNonceTime(nonce);
    const nowMs = this.now().getTime();
    if (
      issuedAt === null ||
      nowMs - issuedAt > NONCE_MAX_AGE_MS ||
      issuedAt - nowMs > CLOCK_SKEW_MS
    ) {
      return err({ type: "stale_nonce" });
    }

    const verified = await this.checkAuthentication(params);
    if (!verified.ok) return verified;

    const fresh = await this.deps.nonces.consume(
      `steam:${nonce}`,
      new Date(issuedAt + NONCE_MAX_AGE_MS + CLOCK_SKEW_MS),
    );
    if (!fresh) return err({ type: "replayed_nonce" });

    return ok(steamId.value);
  }

  private async checkAuthentication(
    params: URLSearchParams,
  ): Promise<Result<true, IdentityVerificationError>> {
    // Exactly the values verifyCallback checked (one per field: duplicates were refused).
    const body = new URLSearchParams();
    for (const [k, v] of params) if (k.startsWith("openid.") && !body.has(k)) body.set(k, v);
    body.set("openid.mode", "check_authentication");

    let text: string;
    try {
      const res = await this.fetchFn(STEAM_OPENID_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        signal: AbortSignal.timeout(this.deps.timeoutMs ?? 8_000),
        redirect: "error",
      });
      if (!res.ok) return err({ type: "provider_unavailable", cause: `status ${res.status}` });
      text = await res.text();
    } catch (e) {
      return err({ type: "provider_unavailable", cause: e instanceof Error ? e.name : "unknown" });
    }

    const isValid = text
      .split("\n")
      .map((l) => l.trim())
      .includes("is_valid:true");
    return isValid ? ok(true) : err({ type: "provider_rejected" });
  }
}

/** OpenID nonces start with an ISO-8601 UTC timestamp: 2026-09-29T12:00:00Z<unique>. */
export function parseNonceTime(nonce: string): number | null {
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)/.exec(nonce);
  if (!m) return null;
  const t = Date.parse(m[1]);
  return Number.isNaN(t) ? null : t;
}
