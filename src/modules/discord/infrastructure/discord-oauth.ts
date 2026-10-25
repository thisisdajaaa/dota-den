import { createPublicKey, verify } from "node:crypto";
import { z } from "zod";

const API = "https://discord.com/api/v10";
const DiscordUser = z.object({
  id: z.string().regex(/^\d{15,25}$/),
  username: z.string().min(1).max(64),
  global_name: z.string().max(64).nullable().optional(),
  avatar: z.string().max(64).nullable().optional(),
});
import type { DiscordIdentity } from "../discord.ports";

/** Discord sign-in for linking an account (OAuth2 authorization code, scope `identify`). */
export class DiscordOAuth {
  constructor(
    private readonly opts: {
      clientId: string;
      clientSecret: string;
      redirectUri: string;
      fetch?: typeof fetch;
      timeoutMs?: number;
    },
  ) {}

  authorizeUrl(state: string): string {
    const u = new URL("https://discord.com/oauth2/authorize");
    u.searchParams.set("response_type", "code");
    u.searchParams.set("client_id", this.opts.clientId);
    u.searchParams.set("scope", "identify");
    u.searchParams.set("redirect_uri", this.opts.redirectUri);
    u.searchParams.set("state", state);
    u.searchParams.set("prompt", "none");
    return u.toString();
  }

  /** The Discord account behind an authorization code, or null when Discord refuses it. */
  async identify(code: string): Promise<DiscordIdentity | null> {
    const f = this.opts.fetch ?? fetch;
    const signal = AbortSignal.timeout(this.opts.timeoutMs ?? 8_000);
    const token = await f(`${API}/oauth2/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.opts.clientId,
        client_secret: this.opts.clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: this.opts.redirectUri,
      }).toString(),
      signal,
      redirect: "error",
    });
    if (!token.ok) return null;
    const parsed = z.object({ access_token: z.string().min(1) }).safeParse(await token.json());
    if (!parsed.success) return null;
    const me = await f(`${API}/users/@me`, {
      headers: { authorization: `Bearer ${parsed.data.access_token}` },
      signal,
      redirect: "error",
    });
    if (!me.ok) return null;
    const user = DiscordUser.safeParse(await me.json());
    if (!user.success) return null;
    return {
      id: user.data.id,
      username: user.data.username,
      globalName: user.data.global_name ?? null,
      avatar: user.data.avatar ?? null,
    };
  }
}

/** Ed25519 SPKI header: the 32-byte public key Discord gives goes after it. */
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/**
 * Whether an interaction request really comes from Discord: an Ed25519 signature over the
 * timestamp and the raw body, with the application's public key (Discord rejects endpoints
 * that don't check this).
 */
export function verifyInteraction(
  publicKeyHex: string,
  signatureHex: string | null,
  timestamp: string | null,
  body: string,
): boolean {
  if (!signatureHex || !timestamp || !/^[0-9a-f]{128}$/i.test(signatureHex)) return false;
  try {
    const key = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(publicKeyHex, "hex")]),
      format: "der",
      type: "spki",
    });
    return verify(null, Buffer.from(timestamp + body), key, Buffer.from(signatureHex, "hex"));
  } catch {
    return false;
  }
}
