import {
  AppError,
  ConflictError,
  NotFoundError,
  RateLimitedError,
  UpstreamUnavailableError,
  ValidationError,
} from "@/common/errors/app-error";
import type { DataOwner } from "@/common/privacy/user-data";
import { maskWebhook, type WebhookTarget } from "../domain/discord-webhook";
import type { DiscordMessage } from "../domain/feed";
import type {
  DiscordClient,
  PostLogPort,
  StoredFeed,
  WebhooksRepositoryPort,
} from "../discord.ports";
import type { DiscordStatusDto } from "../dtos/responses/discord-status.dto";

/** A signed-in player, as this service needs them. */
export interface FeedOwner {
  id: string;
  accountId32: number;
  language: string | null;
  name: string | null;
}

/** Setting up the feed: save (checked with Discord), on/off, test post, remove; privacy. */
export class DiscordWebhookService {
  private readonly now: () => Date;

  constructor(
    private readonly deps: {
      webhooks: WebhooksRepositoryPort;
      log: PostLogPort;
      client: DiscordClient;
      /** The test post, in the player's language. */
      testMessage: (user: { language: string | null; name: string | null }) => DiscordMessage;
      now?: () => Date;
    },
  ) {
    this.now = deps.now ?? (() => new Date());
  }

  async status(userId: string): Promise<DiscordStatusDto> {
    return toStatus(await this.deps.webhooks.get(userId));
  }

  /** Checks the webhook with Discord (it answers with its name), then saves it, turned on. */
  async connect(user: FeedOwner, target: WebhookTarget): Promise<DiscordStatusDto> {
    const info = await this.deps.client.info(target);
    if (info.kind === "gone")
      throw new ValidationError(
        "Discord doesn't know that webhook. Copy its URL again from the channel's settings.",
      );
    if (info.kind === "failed")
      throw new UpstreamUnavailableError("Couldn't check the webhook with Discord. Try again.");
    await this.deps.webhooks.save(
      {
        userId: user.id,
        accountId32: user.accountId32,
        target,
        name: info.name,
        channelId: info.channelId,
      },
      this.now(),
    );
    return this.status(user.id);
  }

  async setEnabled(userId: string, enabled: boolean): Promise<DiscordStatusDto> {
    const feed = await this.deps.webhooks.get(userId);
    if (!feed) throw new NotFoundError("No Discord webhook is saved.");
    if (enabled && feed.gone)
      throw new ConflictError("Discord deleted this webhook. Save a new webhook URL first.");
    await this.deps.webhooks.setEnabled(userId, enabled, this.now());
    return this.status(userId);
  }

  async remove(userId: string): Promise<DiscordStatusDto> {
    await this.deps.webhooks.remove(userId);
    return this.status(userId);
  }

  /** Posts a sample message. A webhook Discord deleted is marked gone (posting stops). */
  async sendTest(user: FeedOwner): Promise<DiscordStatusDto> {
    const feed = await this.deps.webhooks.get(user.id);
    if (!feed) throw new NotFoundError("No Discord webhook is saved.");
    if (feed.gone)
      throw new ConflictError("Discord deleted this webhook. Save a new webhook URL first.");
    const outcome = await this.deps.client.post(
      feed.target,
      this.deps.testMessage({ language: user.language, name: user.name }),
    );
    switch (outcome.kind) {
      case "ok":
        return this.status(user.id);
      case "gone": {
        await this.deps.webhooks.markGone(user.id, this.now());
        // The page shows the new state from `details.status`.
        throw new AppError(
          "not_found",
          "Discord says this webhook was deleted, so posting stopped.",
          { status: await this.status(user.id) },
        );
      }
      case "rate_limited":
        throw new RateLimitedError(
          "Discord asked us to slow down. Try again shortly.",
          Math.ceil(outcome.retryAfterMs / 1000),
        );
      default:
        throw new UpstreamUnavailableError("Couldn't reach Discord. Try again.");
    }
  }

  async exportMyData(owner: DataOwner) {
    const [webhook, posts] = await Promise.all([
      this.deps.webhooks.exportForOwner(owner),
      this.deps.log.exportForOwner(owner),
    ]);
    return { discordWebhook: webhook, discordPosts: posts };
  }

  async deleteMyData(owner: DataOwner) {
    const [webhook, posts] = await Promise.all([
      this.deps.webhooks.deleteForOwner(owner),
      this.deps.log.deleteForOwner(owner),
    ]);
    return { discordWebhook: webhook, discordPosts: posts };
  }
}

function toStatus(feed: StoredFeed | null): DiscordStatusDto {
  if (!feed)
    return {
      connected: false,
      enabled: false,
      gone: false,
      name: null,
      maskedUrl: null,
      lastPostedAt: null,
    };
  return {
    connected: true,
    enabled: feed.enabled && !feed.gone,
    gone: feed.gone,
    name: feed.name,
    maskedUrl: maskWebhook(feed.target),
    lastPostedAt: feed.lastPostedAt?.toISOString() ?? null,
  };
}
