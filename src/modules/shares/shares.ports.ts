import type { DataOwner } from "@/common/privacy/user-data";
import type { SessionShare, ShareKind, WeekShare } from "./domain/share";
import type { ShareDocument } from "./shares.model";

export interface SharesRepositoryPort {
  /** Creates the link, or refreshes the snapshot of an existing one for the same thing. */
  upsert(
    input: Omit<ShareDocument, "_id" | "createdAt" | "updatedAt">,
    slug: string,
    now: Date,
  ): Promise<ShareDocument>;
  find(slug: string): Promise<ShareDocument | null>;
  listForUser(userId: string): Promise<ShareDocument[]>;
  remove(userId: string, slug: string): Promise<boolean>;
  exportForOwner(owner: DataOwner): Promise<Record<string, unknown>[]>;
  deleteForOwner(owner: DataOwner): Promise<number>;
}

export interface ShareSources {
  /** The owner's session as a share, or null when it isn't theirs or doesn't exist. */
  session(owner: DataOwner, sessionId: string): Promise<SessionShare | null>;
  /** This week (player's time zone) as a share. */
  week(owner: DataOwner, timeZone: string): Promise<WeekShare>;
  playerName(accountId32: number): Promise<string | null>;
}

export type ShareRequest = { kind: Extract<ShareKind, "session">; ref: string } | { kind: "week" };
