import "server-only";
import { retryAfterMs } from "../domain/discord-webhook";
import type { BotMessage, BotPostOutcome, DiscordApiPort } from "../discord.ports";

const API = "https://discord.com/api/v10";
const TIMEOUT_MS = 10_000;
const SNOWFLAKE = /^\d{15,25}$/;
/** Interaction tokens are URL-safe text; anything else isn't one. */
const TOKEN = /^[A-Za-z0-9._-]{20,500}$/;

/**
 * Discord's REST API for the bot: editing a deferred interaction answer (the interaction
 * token is the credential), and channel posts and DMs with the bot token. Ids are checked
 * before they go into a URL, and redirects are never followed.
 */
export class DiscordApi implements DiscordApiPort {
  constructor(
    private readonly opts: {
      botToken: string | null;
      /** Test override (fixture server); Discord's API otherwise. */
      baseUrl?: string;
      fetch?: typeof fetch;
    },
  ) {}

  get canPost(): boolean {
    return this.opts.botToken !== null;
  }

  private url(path: string) {
    return `${(this.opts.baseUrl ?? API).replace(/\/$/, "")}${path}`;
  }

  private async send(
    method: "POST" | "PATCH",
    path: string,
    body: unknown,
    auth: boolean,
  ): Promise<{ outcome: BotPostOutcome; json: unknown }> {
    const f = this.opts.fetch ?? fetch;
    let res: Response;
    try {
      res = await f(this.url(path), {
        method,
        redirect: "manual",
        cache: "no-store",
        headers: {
          "content-type": "application/json",
          ...(auth && this.opts.botToken ? { authorization: `Bot ${this.opts.botToken}` } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      return { outcome: { kind: "failed" }, json: null };
    }
    const json: unknown = await res.json().catch(() => null);
    if (res.ok) return { outcome: { kind: "ok" }, json };
    if (res.status === 429)
      return {
        outcome: {
          kind: "rate_limited",
          retryAfterMs: retryAfterMs(json, res.headers.get("retry-after")),
        },
        json,
      };
    if (res.status === 401 || res.status === 403 || res.status === 404)
      return { outcome: { kind: "forbidden", status: res.status }, json };
    return { outcome: { kind: "failed", status: res.status }, json };
  }

  async editOriginal(appId: string, token: string, message: BotMessage): Promise<BotPostOutcome> {
    if (!SNOWFLAKE.test(appId) || !TOKEN.test(token)) return { kind: "failed" };
    return (
      await this.send("PATCH", `/webhooks/${appId}/${token}/messages/@original`, message, false)
    ).outcome;
  }

  async postToChannel(channelId: string, message: BotMessage): Promise<BotPostOutcome> {
    if (!this.opts.botToken) return { kind: "failed" };
    if (!SNOWFLAKE.test(channelId)) return { kind: "failed" };
    return (await this.send("POST", `/channels/${channelId}/messages`, message, true)).outcome;
  }

  async directMessage(discordId: string, message: BotMessage): Promise<BotPostOutcome> {
    if (!this.opts.botToken) return { kind: "failed" };
    if (!SNOWFLAKE.test(discordId)) return { kind: "failed" };
    const open = await this.send("POST", "/users/@me/channels", { recipient_id: discordId }, true);
    if (open.outcome.kind !== "ok") return open.outcome;
    const id = (open.json as { id?: unknown } | null)?.id;
    if (typeof id !== "string" || !SNOWFLAKE.test(id)) return { kind: "failed" };
    return this.postToChannel(id, message);
  }
}
