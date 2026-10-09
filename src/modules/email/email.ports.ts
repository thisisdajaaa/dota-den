import type { DataOwner } from "@/common/privacy/user-data";
import type { EmailSubscriptionStatus } from "./email.model";

export interface EmailSubscription {
  userId: string;
  email: string;
  status: EmailSubscriptionStatus;
  confirmSends: Date[];
  unsubscribeNonce: string | null;
}

export interface EmailSubscriptionsPort {
  get(userId: string): Promise<EmailSubscription | null>;
  /** Saves the address as pending with a new confirmation token (a new address restarts it). */
  startConfirmation(
    userId: string,
    email: string,
    token: { hash: string; expiresAt: Date },
    sends: Date[],
    now: Date,
  ): Promise<void>;
  /** Confirms the pending address whose unexpired token has this hash; the token is used up. */
  confirm(tokenHash: string, nonce: string, now: Date): Promise<{ userId: string } | null>;
  /** Ends the confirmed subscription with this nonce; false when there isn't one. */
  unsubscribe(userId: string, nonce: string, now: Date): Promise<boolean>;
  /** Forgets the address entirely. */
  remove(userId: string): Promise<boolean>;
  confirmed(): Promise<Array<{ userId: string; email: string; unsubscribeNonce: string }>>;
  exportForOwner(owner: DataOwner): Promise<Record<string, unknown>[]>;
  deleteForOwner(owner: DataOwner): Promise<number>;
}

export interface EmailLogPort {
  /** Claims an email; false when it was already sent (or claimed). */
  claim(userId: string, kind: string, key: string, now: Date): Promise<boolean>;
  release(userId: string, kind: string, key: string): Promise<void>;
  recordSent(userId: string, kind: string, key: string, providerId: string | null): Promise<void>;
  exportForOwner(owner: DataOwner): Promise<Record<string, unknown>[]>;
  deleteForOwner(owner: DataOwner): Promise<number>;
}

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  /** Lets the provider drop a retried duplicate. */
  idempotencyKey?: string;
}

export type EmailSendOutcome = { ok: true; id: string | null } | { ok: false; status?: number };

/** Delivers one email (Resend). */
export interface EmailSender {
  send(email: OutgoingEmail): Promise<EmailSendOutcome>;
}

/** Absolute links for emails (from APP_URL). */
export interface EmailLinks {
  confirm(token: string): string;
  /** The page a person opens from the email. */
  unsubscribe(token: string): string;
  /** The RFC 8058 one-click endpoint (List-Unsubscribe). */
  unsubscribeOneClick(token: string): string;
  dashboard(): string;
  account(): string;
}

/** A player as the digest needs them (from identity). */
export interface DigestUser {
  id: string;
  accountId32: number;
  language: string | null;
  timeZone: string | null;
}

export interface UserDirectory {
  byIds(ids: readonly string[]): Promise<DigestUser[]>;
}

/** A finished week's ranked record, MMR and heroes (from the MMR journal's weekly recap). */
export interface WeekSource {
  week(
    owner: DataOwner,
    timeZone: string,
    weekOf: string,
  ): Promise<{
    from: string;
    to: string;
    games: number;
    wins: number;
    losses: number;
    mmr: { exact: number | null; estimate: number };
    mostPlayed: { heroId: number; games: number; wins: number } | null;
    best: { heroId: number; games: number; wins: number } | null;
  }>;
}

/** Ranked games grouped into sessions, and the tilt check (from sessions). */
export interface PlayHistorySource {
  rankedSessions(
    owner: DataOwner,
  ): Promise<
    Array<{ matches: Array<{ startedAt: Date; result: "win" | "loss"; heroId: number }> }>
  >;
  tiltStats(owner: DataOwner): Promise<{
    baseline: { games: number; wins: number; rate: number };
    afterLosses: {
      2: { games: number; wins: number; rate: number };
      3: { games: number; wins: number; rate: number };
    };
  }>;
}

export interface HeroNames {
  names(): Promise<Map<number, string>>;
}
