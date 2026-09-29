import { describe, expect, it, vi } from "vitest";
import type { NonceStore } from "@/modules/identity/application/ports";
import {
  parseNonceTime,
  STEAM_OPENID_ENDPOINT,
  SteamOpenIdProvider,
} from "@/modules/identity/infrastructure/steam-openid-provider";

const NOW = new Date("2026-09-29T12:00:00Z");
const RETURN_TO = "https://den.example/api/v1/auth/steam/callback?state=abc";
const STEAM_ID = "76561197960287930";

function validParams(overrides: Record<string, string | null> = {}): URLSearchParams {
  const base: Record<string, string> = {
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "id_res",
    "openid.op_endpoint": STEAM_OPENID_ENDPOINT,
    "openid.claimed_id": `https://steamcommunity.com/openid/id/${STEAM_ID}`,
    "openid.identity": `https://steamcommunity.com/openid/id/${STEAM_ID}`,
    "openid.return_to": RETURN_TO,
    "openid.response_nonce": "2026-09-29T11:59:30Zr4nd0m",
    "openid.assoc_handle": "1234567890",
    "openid.signed": "signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle",
    "openid.sig": "c2lnbmF0dXJl",
    state: "abc",
  };
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...base, ...overrides })) if (v !== null) params.set(k, v);
  return params;
}

function setup(opts: { steamReply?: string; status?: number; fetchThrows?: boolean } = {}) {
  const seen = new Set<string>();
  const nonces: NonceStore = {
    consume: vi.fn(async (n: string) => (seen.has(n) ? false : (seen.add(n), true))),
  };
  const fetch = vi.fn(async (_url: string, _init: RequestInit) => {
    if (opts.fetchThrows) throw new DOMException("timeout", "TimeoutError");
    return new Response(opts.steamReply ?? "ns:http://specs.openid.net/auth/2.0\nis_valid:true\n", {
      status: opts.status ?? 200,
    });
  });
  const provider = new SteamOpenIdProvider({ nonces, fetch, now: () => NOW });
  return { provider, fetch, nonces };
}

async function verify(provider: SteamOpenIdProvider, params: URLSearchParams) {
  return provider.verifyCallback({ params, expectedReturnTo: RETURN_TO });
}

describe("SteamOpenIdProvider.buildAuthorizationUrl", () => {
  it("requests identifier_select with our realm and return_to", () => {
    const { provider } = setup();
    const url = new URL(
      provider.buildAuthorizationUrl({ returnTo: RETURN_TO, realm: "https://den.example/" }),
    );
    expect(url.origin + url.pathname).toBe(STEAM_OPENID_ENDPOINT);
    expect(url.searchParams.get("openid.mode")).toBe("checkid_setup");
    expect(url.searchParams.get("openid.return_to")).toBe(RETURN_TO);
    expect(url.searchParams.get("openid.realm")).toBe("https://den.example/");
    expect(url.searchParams.get("openid.claimed_id")).toBe(
      "http://specs.openid.net/auth/2.0/identifier_select",
    );
  });
});

describe("SteamOpenIdProvider.verifyCallback", () => {
  it("accepts a valid positive assertion after Steam confirms it", async () => {
    const { provider, fetch } = setup();
    const result = await verify(provider, validParams());
    expect(result).toEqual({ ok: true, value: STEAM_ID });

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(STEAM_OPENID_ENDPOINT);
    const body = new URLSearchParams(init.body as string);
    expect(body.get("openid.mode")).toBe("check_authentication");
    expect(body.get("openid.sig")).toBe("c2lnbmF0dXJl");
    expect(body.has("state")).toBe(false);
  });

  it.each([
    ["cancelled", { "openid.mode": "cancel" }, "not_positive_assertion"],
    ["wrong namespace", { "openid.ns": "http://openid.net/signon/1.1" }, "not_positive_assertion"],
    [
      "foreign op_endpoint",
      { "openid.op_endpoint": "https://evil.example/openid/login" },
      "invalid_op_endpoint",
    ],
    [
      "return_to mismatch",
      { "openid.return_to": "https://evil.example/cb?state=abc" },
      "return_to_mismatch",
    ],
    [
      "unsigned claimed_id",
      { "openid.signed": "op_endpoint,identity,return_to,response_nonce,assoc_handle" },
      "missing_signed_fields",
    ],
    [
      "non-Steam claimed_id",
      {
        "openid.claimed_id": "https://evil.example/openid/id/76561197960287930",
        "openid.identity": "https://evil.example/openid/id/76561197960287930",
      },
      "invalid_claimed_id",
    ],
    [
      "http claimed_id",
      {
        "openid.claimed_id": `http://steamcommunity.com/openid/id/${STEAM_ID}`,
        "openid.identity": `http://steamcommunity.com/openid/id/${STEAM_ID}`,
      },
      "invalid_claimed_id",
    ],
    [
      "identity differs from claimed_id",
      { "openid.identity": "https://steamcommunity.com/openid/id/76561197960287931" },
      "invalid_claimed_id",
    ],
    ["malformed nonce", { "openid.response_nonce": "garbage" }, "stale_nonce"],
    ["old nonce", { "openid.response_nonce": "2026-09-29T11:50:00Zold" }, "stale_nonce"],
    ["future nonce", { "openid.response_nonce": "2026-09-29T12:05:00Zfuture" }, "stale_nonce"],
  ] as const)("rejects %s without calling Steam", async (_name, overrides, type) => {
    const { provider, fetch } = setup();
    const result = await verify(provider, validParams(overrides));
    expect(result).toMatchObject({ ok: false, error: { type } });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects when Steam says the assertion is invalid", async () => {
    const { provider } = setup({
      steamReply: "ns:http://specs.openid.net/auth/2.0\nis_valid:false\n",
    });
    expect(await verify(provider, validParams())).toMatchObject({
      ok: false,
      error: { type: "provider_rejected" },
    });
  });

  it("does not treat a substring match as valid", async () => {
    const { provider } = setup({ steamReply: "note:is_valid:true\nis_valid:false\n" });
    expect(await verify(provider, validParams())).toMatchObject({ ok: false });
  });

  it("reports provider_unavailable on network failure or HTTP error", async () => {
    expect(await verify(setup({ fetchThrows: true }).provider, validParams())).toMatchObject({
      ok: false,
      error: { type: "provider_unavailable" },
    });
    expect(await verify(setup({ status: 502 }).provider, validParams())).toMatchObject({
      ok: false,
      error: { type: "provider_unavailable" },
    });
  });

  it("rejects a replayed response", async () => {
    const { provider } = setup();
    expect((await verify(provider, validParams())).ok).toBe(true);
    expect(await verify(provider, validParams())).toMatchObject({
      ok: false,
      error: { type: "replayed_nonce" },
    });
  });
});

describe("parseNonceTime", () => {
  it("parses the leading UTC timestamp", () => {
    expect(parseNonceTime("2026-09-29T11:59:30Zabc")).toBe(Date.parse("2026-09-29T11:59:30Z"));
    expect(parseNonceTime("2026-13-99T99:99:99Zabc")).toBeNull();
    expect(parseNonceTime("")).toBeNull();
  });
});
