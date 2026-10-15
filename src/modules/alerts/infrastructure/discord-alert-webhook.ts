import "server-only";
import { webhookUrl, type WebhookTarget } from "@/modules/discord/domain/discord-webhook";
import type { AlertWebhookPort } from "../alerts.ports";

const TIMEOUT_MS = 8_000;
/** Discord's limits: 256 characters for an embed title, 4096 for its description. */
const MAX_TITLE = 256;
const MAX_BODY = 2_000;

/**
 * Posts owner alerts to the owner's Discord channel. The URL is rebuilt from a validated
 * target (Discord's hosts only) and redirects are never followed.
 */
export class DiscordAlertWebhook implements AlertWebhookPort {
  constructor(
    private readonly target: WebhookTarget,
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
  ) {}

  async post(message: { title: string; body: string }): Promise<"sent" | "failed"> {
    try {
      const res = await this.fetchImpl(webhookUrl(this.target), {
        method: "POST",
        redirect: "manual",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: "Dota Den alerts",
          embeds: [
            {
              title: message.title.slice(0, MAX_TITLE),
              description: message.body.slice(0, MAX_BODY),
              color: 0xe5484d,
            },
          ],
          // Never ping anyone, whatever the text says.
          allowed_mentions: { parse: [] },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      return res.ok ? "sent" : "failed";
    } catch {
      return "failed";
    }
  }
}
