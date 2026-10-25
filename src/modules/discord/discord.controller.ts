import "server-only";
import { NextResponse } from "next/server";
import { NotFoundError, UnauthorizedError, ValidationError } from "@/common/errors/app-error";
import { handler } from "@/common/http/controller";
import { ServiceResponse } from "@/common/http/service-response";
import { requireUser, type User } from "@/modules/identity";
import { InteractionSchema } from "./domain/bot";
import { parseWebhookUrl } from "./domain/discord-webhook";
import { ConnectWebhookSchema, FeedSettingsSchema } from "./schemas/discord.schema";
import type { DiscordBotService } from "./services/discord-bot.service";
import type { DiscordLinkService } from "./services/discord-link.service";
import type { DiscordWebhookService, FeedOwner } from "./services/discord-webhook.service";

const LINK_STATE_COOKIE = "dd_discord_state";
const LINK_COOKIE_PATH = "/api/v1/discord";
/** Discord's interaction payloads are small; anything bigger isn't one. */
const MAX_INTERACTION_BYTES = 64 * 1024;

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
      links: () => DiscordLinkService;
      bot: () => DiscordBotService;
      /** The application's public key; null when the bot isn't set up. */
      publicKey: () => string | null;
      verify: (
        publicKey: string,
        signature: string | null,
        timestamp: string | null,
        body: string,
      ) => boolean;
      secureCookies: () => boolean;
    },
  ) {}

  /** GET /api/v1/discord/link: off to Discord to link your account (state in a cookie). */
  link = handler(
    { guard: requireUser, rateLimit: { name: "discord:link", limit: 20, windowMs: 60_000 } },
    async () => {
      const start = this.deps.links().begin();
      if (!start) throw new NotFoundError("Connecting Discord isn't set up here.");
      const res = NextResponse.redirect(start.url, 303);
      res.cookies.set(LINK_STATE_COOKIE, start.state, {
        httpOnly: true,
        sameSite: "lax",
        secure: this.deps.secureCookies(),
        path: LINK_COOKIE_PATH,
        maxAge: 600,
      });
      res.headers.set("cache-control", "private, no-store");
      return res;
    },
  );

  /** GET /api/v1/discord/callback: back from Discord; links the accounts, then the account page. */
  callback = handler(
    { guard: requireUser, rateLimit: { name: "discord:link", limit: 20, windowMs: 60_000 } },
    async ({ req, user }) => {
      const url = new URL(req.url);
      const outcome = await this.deps.links().finish(user, {
        code: url.searchParams.get("code"),
        state: url.searchParams.get("state"),
        cookieState: req.cookies.get(LINK_STATE_COOKIE)?.value ?? null,
      });
      const res = NextResponse.redirect(
        new URL(`/account?discord=${outcome}#discord-link`, req.url),
        303,
      );
      res.cookies.delete({ name: LINK_STATE_COOKIE, path: LINK_COOKIE_PATH });
      res.headers.set("cache-control", "private, no-store");
      return res;
    },
  );

  /** DELETE /api/v1/me/discord/link: unlink your Discord account. */
  unlink = handler(
    { guard: requireUser, rateLimit: { name: "discord:settings", limit: 30, windowMs: 60_000 } },
    async ({ user }) => {
      await this.deps.links().unlink(user.id);
      return ServiceResponse.success(await this.deps.links().status(user.id), "Discord unlinked");
    },
  );

  /**
   * POST /api/v1/discord/interactions: the bot's slash commands. Discord's servers call it, so
   * there's no session or Origin; the Ed25519 signature over the raw body is the credential.
   */
  interactions = handler(
    {
      sameOrigin: false,
      rateLimit: { name: "discord:bot", limit: 600, windowMs: 60_000, byIp: true },
    },
    async ({ req }) => {
      const publicKey = this.deps.publicKey();
      if (!publicKey) throw new NotFoundError("Not found");
      if (Number(req.headers.get("content-length") ?? 0) > MAX_INTERACTION_BYTES)
        throw new ValidationError("Body too large");
      const body = await req.text();
      if (body.length > MAX_INTERACTION_BYTES) throw new ValidationError("Body too large");
      const ok = this.deps.verify(
        publicKey,
        req.headers.get("x-signature-ed25519"),
        req.headers.get("x-signature-timestamp"),
        body,
      );
      if (!ok) throw new UnauthorizedError("Invalid request signature");
      let json: unknown;
      try {
        json = JSON.parse(body);
      } catch {
        throw new ValidationError("Invalid interaction");
      }
      const interaction = InteractionSchema.safeParse(json);
      if (!interaction.success) throw new ValidationError("Invalid interaction");
      // Discord reads the reply as is: no envelope.
      return NextResponse.json(await this.deps.bot().handle(interaction.data));
    },
  );

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
