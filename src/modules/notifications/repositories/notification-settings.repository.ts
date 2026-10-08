import "server-only";
import type { Db } from "mongodb";
import { forExport, type DataOwner } from "@/common/privacy/user-data";
import type { NotificationPrefs } from "../domain/notification";
import {
  NOTIFICATIONS_COLLECTIONS,
  type NotificationSettingsDocument,
} from "../notifications.model";
import type { SettingsRepositoryPort } from "../notifications.ports";

export class NotificationSettingsRepository implements SettingsRepositoryPort {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async col() {
    return (await this.getDb()).collection<NotificationSettingsDocument>(
      NOTIFICATIONS_COLLECTIONS.settings,
    );
  }

  async prefs(userId: string): Promise<NotificationPrefs | null> {
    return (await (await this.col()).findOne({ _id: userId }))?.prefs ?? null;
  }

  async savePrefs(userId: string, prefs: NotificationPrefs, now: Date): Promise<void> {
    await (
      await this.col()
    ).updateOne({ _id: userId }, { $set: { prefs, updatedAt: now } }, { upsert: true });
  }

  async exportForOwner(owner: DataOwner) {
    return forExport(await (await this.col()).find({ _id: owner.userId }).toArray());
  }

  async deleteForOwner(owner: DataOwner): Promise<number> {
    return (await (await this.col()).deleteMany({ _id: owner.userId })).deletedCount;
  }
}
