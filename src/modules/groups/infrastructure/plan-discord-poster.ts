import "server-only";
import {
  isGoneStatus,
  retryAfterMs,
  webhookUrl,
  type WebhookTarget,
} from "@/modules/discord/domain/discord-webhook";
import type { DiscordMessage } from "@/modules/discord/domain/feed";
import type { PlannerDiscord, PostOutcome } from "../groups.ports";

const TIMEOUT_MS = 10_000;

interface SavedWebhook {
  target: WebhookTarget;
  name: string | null;
  gone: boolean;
}

/**
 * Posts a stack plan to the viewer's own saved Discord webhook (the one on their account
 * page). Requests only go to the URL rebuilt from the validated target; redirects are never
 * followed. A webhook Discord deleted is marked gone, as the feed does.
 */
export class PlanDiscordPoster implements PlannerDiscord {
  constructor(
    private readonly webhooks: {
      get(userId: string): Promise<SavedWebhook | null>;
      markGone(userId: string, now: Date): Promise<void>;
    },
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
  ) {}

  async channel(userId: string): Promise<{ name: string | null } | null> {
    const saved = await this.webhooks.get(userId);
    return saved && !saved.gone ? { name: saved.name } : null;
  }

  async post(userId: string, message: DiscordMessage): Promise<PostOutcome> {
    const saved = await this.webhooks.get(userId);
    if (!saved || saved.gone) return { kind: "none" };
    let res: Response;
    try {
      res = await this.fetchImpl(webhookUrl(saved.target), {
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
    if (isGoneStatus(res.status)) {
      await this.webhooks.markGone(userId, new Date());
      return { kind: "gone" };
    }
    if (res.status === 429) {
      const body: unknown = await res.json().catch(() => null);
      return {
        kind: "rate_limited",
        retryAfterMs: retryAfterMs(body, res.headers.get("retry-after")),
      };
    }
    return { kind: "failed" };
  }
}
