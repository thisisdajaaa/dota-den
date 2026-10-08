import "server-only";
import webpush, { WebPushError } from "web-push";
import { isGoneStatus, type NotificationMessage } from "../domain/notification";
import type { PushSender, SendOutcome, StoredSubscription } from "../notifications.ports";

/** Notifications older than a day aren't worth showing: push services may drop them. */
const TTL_SECONDS = 24 * 3600;

export class WebPushSender implements PushSender {
  constructor(private readonly vapid: { publicKey: string; privateKey: string; subject: string }) {}

  async send(sub: StoredSubscription, message: NotificationMessage): Promise<SendOutcome> {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        JSON.stringify(message),
        { vapidDetails: this.vapid, TTL: TTL_SECONDS, urgency: "normal", timeout: 10_000 },
      );
      return { ok: true };
    } catch (error) {
      const status = error instanceof WebPushError ? error.statusCode : undefined;
      return { ok: false, gone: isGoneStatus(status), status };
    }
  }
}
