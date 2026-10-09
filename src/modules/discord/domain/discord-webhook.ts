/**
 * Discord webhooks: which URLs are accepted, how they're shown, and what Discord's answers mean.
 * The server sends requests to a webhook URL a player pasted, so the rules here are strict:
 * only Discord's own hosts over https, and only the exact webhook path (no SSRF).
 */

/** Discord's hosts that serve webhooks (stable, beta and canary clients, and the old domain). */
export const DISCORD_WEBHOOK_HOSTS = [
  "discord.com",
  "discordapp.com",
  "ptb.discord.com",
  "canary.discord.com",
] as const;

/** A parsed webhook: where to send and the secret token. Rebuilt from parts, never echoed raw. */
export interface WebhookTarget {
  /** `https://discord.com` (or a test host in E2E runs). */
  origin: string;
  /** The webhook's snowflake id (not secret: Discord shows it to anyone with the channel). */
  id: string;
  /** The secret part: anyone with it can post to the channel. */
  token: string;
}

const MAX_URL_LENGTH = 300;
const WEBHOOK_PATH = /^\/api\/webhooks\/(\d{17,20})\/([A-Za-z0-9_-]{40,100})\/?$/;

/**
 * Parses a pasted webhook URL. Null unless it is `https://<discord host>/api/webhooks/{id}/{token}`
 * with no port, credentials, query or fragment. `testHosts` (E2E only) may use http and a port.
 */
export function parseWebhookUrl(
  raw: string,
  opts: { testHosts?: readonly string[] } = {},
): WebhookTarget | null {
  const input = raw.trim();
  if (input.length === 0 || input.length > MAX_URL_LENGTH) return null;
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (url.username || url.password || url.search || url.hash) return null;
  const testHost = (opts.testHosts ?? []).includes(url.hostname);
  if (testHost) {
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  } else {
    if (url.protocol !== "https:" || url.port !== "") return null;
    if (!(DISCORD_WEBHOOK_HOSTS as readonly string[]).includes(url.hostname)) return null;
  }
  const m = WEBHOOK_PATH.exec(url.pathname);
  if (!m) return null;
  return { origin: url.origin, id: m[1], token: m[2] };
}

/** The URL requests go to, built from the parsed parts only. */
export function webhookUrl(target: WebhookTarget): string {
  return `${target.origin}/api/webhooks/${target.id}/${target.token}`;
}

/** What the Account page shows: host and id, never the token. */
export function maskWebhook(target: Pick<WebhookTarget, "origin" | "id">): string {
  const host = target.origin.replace(/^https?:\/\//, "");
  return `${host}/api/webhooks/${target.id}/••••••••`;
}

/** Discord says the webhook no longer exists (deleted in the channel, or the token changed). */
export function isGoneStatus(status: number): boolean {
  return status === 404 || status === 401;
}

/** How long to wait after a 429, from Discord's body (`retry_after`, seconds) or header. */
export function retryAfterMs(body: unknown, header: string | null): number {
  const fromBody =
    typeof body === "object" && body !== null && "retry_after" in body
      ? Number((body as { retry_after: unknown }).retry_after)
      : NaN;
  const seconds = Number.isFinite(fromBody) ? fromBody : Number(header);
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds * 1000) : 1000;
}
