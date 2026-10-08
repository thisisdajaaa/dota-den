import type { DataOwner } from "@/common/privacy/user-data";
import type {
  NotificationKind,
  NotificationMessage,
  NotificationPrefs,
} from "./domain/notification";

export interface StoredSubscription {
  endpoint: string;
  userId: string;
  keys: { p256dh: string; auth: string };
}

export interface SubscriptionsRepositoryPort {
  save(sub: StoredSubscription & { userAgent: string | null }, now: Date): Promise<void>;
  remove(userId: string, endpoint: string): Promise<boolean>;
  /** Removes a dead endpoint, whoever owns it. */
  removeEndpoint(endpoint: string): Promise<void>;
  forUser(userId: string): Promise<StoredSubscription[]>;
  /** Users with at least one device subscribed. */
  subscribedUserIds(): Promise<string[]>;
  markSent(endpoints: readonly string[], now: Date): Promise<void>;
  exportForOwner(owner: DataOwner): Promise<Record<string, unknown>[]>;
  deleteForOwner(owner: DataOwner): Promise<number>;
}

export interface SettingsRepositoryPort {
  prefs(userId: string): Promise<NotificationPrefs | null>;
  savePrefs(userId: string, prefs: NotificationPrefs, now: Date): Promise<void>;
  exportForOwner(owner: DataOwner): Promise<Record<string, unknown>[]>;
  deleteForOwner(owner: DataOwner): Promise<number>;
}

export interface NotificationLogPort {
  /** Claims a notification; false when it was already sent (or claimed). */
  claim(userId: string, kind: NotificationKind, key: string, now: Date): Promise<boolean>;
  release(userId: string, kind: NotificationKind, key: string): Promise<void>;
  recordDelivered(userId: string, kind: NotificationKind, key: string, n: number): Promise<void>;
  exportForOwner(owner: DataOwner): Promise<Record<string, unknown>[]>;
  deleteForOwner(owner: DataOwner): Promise<number>;
}

export type SendOutcome = { ok: true } | { ok: false; gone: boolean; status?: number };

/** Delivers one message to one device (Web Push). */
export interface PushSender {
  send(sub: StoredSubscription, message: NotificationMessage): Promise<SendOutcome>;
}

/** A player as the triggers need them (from identity). */
export interface NotifiedUser {
  id: string;
  accountId32: number;
  language: string | null;
  timeZone: string | null;
}

export interface UserDirectory {
  byIds(ids: readonly string[]): Promise<NotifiedUser[]>;
}

/** The player's newest session (from sessions). */
export interface LatestSessionSource {
  latest(owner: DataOwner): Promise<{
    id: string;
    endedAt: Date;
    gapMinutes: number;
    games: number;
    wins: number;
    heroIds: number[];
  } | null>;
}

/** Last week's ranked record (from the MMR journal's weekly recap). */
export interface WeeklyRecordSource {
  lastWeek(
    owner: DataOwner,
    timeZone: string,
  ): Promise<{ games: number; wins: number; losses: number }>;
}

/** Heroes in the player's pool that the newest patch changed (from patches). */
export interface PatchDigestSource {
  digest(
    owner: DataOwner,
  ): Promise<{ version: string; publishedAt: Date; heroIds: number[] } | null>;
}

export interface HeroNames {
  names(): Promise<Map<number, string>>;
}
