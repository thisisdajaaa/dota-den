import { err, ok, type Result } from "@/common/result";
import { parseSteamId64, type SteamId64 } from "../domain/steam-id";
import type { IdentityProvider, IdentityVerificationError } from "../identity.ports";

/**
 * Test-only identity provider for E2E runs (AUTH_TEST_MODE=true, never in production).
 * Redirects straight back to the callback with `test_steam_id`.
 */
export class FakeIdentityProvider implements IdentityProvider {
  constructor(private readonly defaultSteamId: string = "76561197960287930") {}

  buildAuthorizationUrl({ returnTo }: { returnTo: string; realm: string }): string {
    const url = new URL(returnTo);
    url.searchParams.set("test_steam_id", this.defaultSteamId);
    return url.toString();
  }

  async verifyCallback({
    params,
  }: {
    params: URLSearchParams;
    expectedReturnTo: string;
  }): Promise<Result<SteamId64, IdentityVerificationError>> {
    const parsed = parseSteamId64(params.get("test_steam_id") ?? "");
    return parsed.ok ? ok(parsed.value) : err({ type: "invalid_claimed_id" });
  }
}
