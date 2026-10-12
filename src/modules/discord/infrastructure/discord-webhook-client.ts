import "server-only";
import {
  isGoneStatus,
  retryAfterMs,
  webhookUrl,
  type WebhookTarget,
} from "../domain/discord-webhook";
import type { DiscordMessage } from "../domain/feed";
import type { DiscordClient, PostOutcome, WebhookInfoOutcome } from "../discord.ports";

const TIMEOUT_MS = 10_000;

/**
 * Discord's webhook API. Requests only go to URLs rebuilt from a validated target, and
 * redirects are never followed (a redirect could point anywhere).
 */
export class DiscordWebhookClient implements DiscordClient {
  constructor(private readonly fetchImpl: typeof fetch = (...args) => fetch(...args)) {}

  async info(target: WebhookTarget): Promise<WebhookInfoOutcome> {
    let res: Response;
    try {
      res = await this.fetchImpl(webhookUrl(target), {
        method: "GET",
        redirect: "manual",
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      return { kind: "failed" };
    }
    if (isGoneStatus(res.status)) return { kind: "gone" };
    if (!res.ok) return { kind: "failed", status: res.status };
    const body = (await res.json().catch(() => null)) as {
      id?: unknown;
      name?: unknown;
      channel_id?: unknown;
    } | null;
    // A webhook answers with its own id; anything else isn't the webhook we asked for.
    if (!body || String(body.id) !== target.id) return { kind: "failed", status: res.status };
    return {
      kind: "ok",
      name: typeof body.name === "string" ? body.name.slice(0, 80) : null,
      channelId: typeof body.channel_id === "string" ? body.channel_id.slice(0, 30) : null,
    };
  }

  async post(target: WebhookTarget, message: DiscordMessage): Promise<PostOutcome> {
    let res: Response;
    try {
      res = await this.fetchImpl(webhookUrl(target), {
        method: "POST",
        redirect: "manual",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      return { kind: "failed" };
    }
    if (res.ok) return { kind: "ok" };
    if (isGoneStatus(res.status)) return { kind: "gone" };
    if (res.status === 429) {
      const body: unknown = await res.json().catch(() => null);
      return {
        kind: "rate_limited",
        retryAfterMs: retryAfterMs(body, res.headers.get("retry-after")),
        global:
          (typeof body === "object" && body !== null && "global" in body && body.global === true) ||
          res.headers.get("x-ratelimit-global") === "true",
      };
    }
    return { kind: "failed", status: res.status };
  }
}
