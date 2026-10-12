import "server-only";
import { ValidationError } from "@/common/errors/app-error";
import { handler } from "@/common/http/controller";
import { ServiceResponse } from "@/common/http/service-response";
import { requireUser, type User } from "@/modules/identity";
import { parseWebhookUrl } from "./domain/discord-webhook";
import { ConnectWebhookSchema, FeedSettingsSchema } from "./schemas/discord.schema";
import type { DiscordWebhookService, FeedOwner } from "./services/discord-webhook.service";

const owner = (user: User): FeedOwner => ({
  id: user.id,
  accountId32: user.accountId32,
  language: user.settings.language ?? null,
  name: user.persona?.name ?? null,
});

export class DiscordController {
  constructor(
    private readonly deps: {
      service: DiscordWebhookService;
      /** Extra hosts a webhook may use (a local fake in E2E runs; none in production). */
      testHosts: () => readonly string[];
    },
  ) {}

  /** PUT /api/v1/me/discord/webhook: save a webhook URL (checked with Discord first). */
  connect = handler(
    {
      guard: requireUser,
      rateLimit: { name: "discord:connect", limit: 10, windowMs: 60_000 },
      body: ConnectWebhookSchema,
    },
    async ({ user, body }) => {
      // The server sends requests to this URL: only Discord's own webhook URLs get through.
      const target = parseWebhookUrl(body.url, { testHosts: this.deps.testHosts() });
      if (!target) throw new ValidationError("That isn't a Discord webhook URL.");
      const status = await this.deps.service.connect(owner(user), target);
      return ServiceResponse.success(status, "Discord webhook saved");
    },
  );

  /** DELETE /api/v1/me/discord/webhook: forget the webhook. */
  remove = handler(
    {
      guard: requireUser,
      rateLimit: { name: "discord:settings", limit: 30, windowMs: 60_000 },
    },
    async ({ user }) =>
      ServiceResponse.success(await this.deps.service.remove(user.id), "Discord webhook removed"),
  );

  /** PUT /api/v1/me/discord/feed: turn posting on or off. */
  setEnabled = handler(
    {
      guard: requireUser,
      rateLimit: { name: "discord:settings", limit: 30, windowMs: 60_000 },
      body: FeedSettingsSchema,
    },
    async ({ user, body }) =>
      ServiceResponse.success(
        await this.deps.service.setEnabled(user.id, body.enabled),
        body.enabled ? "Discord posts on" : "Discord posts off",
      ),
  );

  /** POST /api/v1/me/discord/test: a sample post to the channel. */
  sendTest = handler(
    {
      guard: requireUser,
      rateLimit: { name: "discord:test", limit: 5, windowMs: 60_000 },
    },
    async ({ user }) =>
      ServiceResponse.success(await this.deps.service.sendTest(owner(user)), "Test post sent"),
  );
}
