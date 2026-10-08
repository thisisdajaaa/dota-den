import type { NotificationKind, NotificationPrefs } from "./domain/notification";

export const NOTIFICATIONS_COLLECTIONS = {
  subscriptions: "push_subscriptions",
  settings: "notification_settings",
  log: "notification_log",
} as const;

/** One browser or phone that agreed to receive notifications. */
export interface PushSubscriptionDocument {
  /** The push service endpoint (unique per device and browser). */
  _id: string;
  userId: string;
  keys: { p256dh: string; auth: string };
  userAgent: string | null;
  createdAt: Date;
  lastSentAt: Date | null;
}

/** Which kinds a player wants, for all their devices. */
export interface NotificationSettingsDocument {
  /** The user id. */
  _id: string;
  prefs: NotificationPrefs;
  updatedAt: Date;
}

/** One sent notification, so the same news is never sent twice. */
export interface NotificationLogDocument {
  /** `${userId}:${kind}:${key}` */
  _id: string;
  userId: string;
  kind: NotificationKind;
  key: string;
  sentAt: Date;
  /** Devices it reached. */
  delivered: number;
}

export const notificationLogId = (userId: string, kind: NotificationKind, key: string) =>
  `${userId}:${kind}:${key}`;
