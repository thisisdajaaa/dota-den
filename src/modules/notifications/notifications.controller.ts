import "server-only";
import {
  NotFoundError,
  UpstreamUnavailableError,
  ValidationError,
} from "@/common/errors/app-error";
import { handler } from "@/common/http/controller";
import { ServiceResponse } from "@/common/http/service-response";
import { requireUser } from "@/modules/identity";
import { isPushServiceEndpoint, type NotificationMessage } from "./domain/notification";
import { PrefsSchema, SubscribeSchema, UnsubscribeSchema } from "./schemas/notifications.schema";
import type { NotificationService } from "./services/notification.service";

export class NotificationsController {
  constructor(
    private readonly deps: {
      service: NotificationService;
      /** A sample in the player's language. */
      testMessage: (language: string | null) => NotificationMessage;
      /** Push service hosts a subscription may point at. */
      pushHosts: () => readonly string[];
    },
  ) {}

  private requireEnabled() {
    if (!this.deps.service.enabled)
      throw new UpstreamUnavailableError("Notifications aren't set up on this server.");
  }

  /** PUT /api/v1/me/notifications/subscription: this device wants notifications. */
  subscribe = handler(
    {
      guard: requireUser,
      rateLimit: { name: "notifications:subscribe", limit: 10, windowMs: 60_000 },
      body: SubscribeSchema,
    },
    async ({ req, user, body }) => {
      this.requireEnabled();
      if (!isPushServiceEndpoint(body.endpoint, this.deps.pushHosts()))
        throw new ValidationError("That isn't a browser push service address.");
      await this.deps.service.subscribe(
        user.id,
        { endpoint: body.endpoint, keys: body.keys },
        req.headers.get("user-agent")?.slice(0, 300) ?? null,
      );
      return ServiceResponse.success(await this.deps.service.status(user.id), "Notifications on");
    },
  );

  /** DELETE /api/v1/me/notifications/subscription: this device stops getting them. */
  unsubscribe = handler(
    {
      guard: requireUser,
      rateLimit: { name: "notifications:subscribe", limit: 10, windowMs: 60_000 },
      body: UnsubscribeSchema,
    },
    async ({ user, body }) => {
      await this.deps.service.unsubscribe(user.id, body.endpoint);
      return ServiceResponse.success(await this.deps.service.status(user.id), "Notifications off");
    },
  );

  /** PUT /api/v1/me/notifications/preferences: which kinds to send (all devices). */
  setPrefs = handler(
    {
      guard: requireUser,
      rateLimit: { name: "notifications:prefs", limit: 30, windowMs: 60_000 },
      body: PrefsSchema,
    },
    async ({ user, body }) => {
      const prefs = await this.deps.service.setPrefs(user.id, body);
      return ServiceResponse.success({ prefs }, "Notification settings saved");
    },
  );

  /** POST /api/v1/me/notifications/test: a sample notification to every device. */
  sendTest = handler(
    {
      guard: requireUser,
      rateLimit: { name: "notifications:test", limit: 5, windowMs: 60_000 },
    },
    async ({ user }) => {
      this.requireEnabled();
      const delivered = await this.deps.service.deliver(
        user.id,
        this.deps.testMessage(user.settings.language ?? null),
      );
      if (delivered === 0) throw new NotFoundError("No device could be reached");
      return ServiceResponse.success({ delivered }, "Test notification sent");
    },
  );
}
