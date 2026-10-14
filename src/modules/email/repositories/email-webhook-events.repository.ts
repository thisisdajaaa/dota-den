import "server-only";
import type { Db } from "mongodb";
import { EMAIL_COLLECTIONS, type EmailWebhookEventDocument } from "../email.model";
import type { EmailWebhookEventsPort } from "../email.ports";

/** Svix retries a message for about a day and a half; a week covers that with room to spare. */
const EVENT_TTL_SECONDS = 7 * 24 * 3600;

/** Handled webhook message ids: inserting the id is the claim, as with email_log. */
export class EmailWebhookEventsRepository implements EmailWebhookEventsPort {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async col() {
    return (await this.getDb()).collection<EmailWebhookEventDocument>(
      EMAIL_COLLECTIONS.webhookEvents,
    );
  }

  async ensureIndexes(): Promise<void> {
    await (
      await this.col()
    ).createIndex({ receivedAt: 1 }, { name: "ttl", expireAfterSeconds: EVENT_TTL_SECONDS });
  }

  async claim(id: string, type: string, now: Date): Promise<boolean> {
    try {
      await (await this.col()).insertOne({ _id: id, type, receivedAt: now });
      return true;
    } catch (error) {
      if ((error as { code?: number }).code === 11000) return false;
      throw error;
    }
  }

  async release(id: string): Promise<void> {
    await (await this.col()).deleteOne({ _id: id });
  }
}
