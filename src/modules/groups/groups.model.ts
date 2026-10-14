import type { ObjectId } from "mongodb";

export const GROUPS_SCHEMA_VERSION = 1;
export const GROUPS_COLLECTION = "groups";

export interface GroupMemberDoc {
  userId: string;
  accountId32: number;
  joinedAt: Date;
}

/** One group, members embedded (at most MAX_GROUP_MEMBERS). */
export interface GroupDoc {
  _id: ObjectId;
  name: string;
  ownerUserId: string;
  /** Unique; replaced when the owner resets the link. */
  inviteToken: string;
  members: GroupMemberDoc[];
  /** When each member pair's shared matches were last checked (`"a:b"`, a < b). */
  pairsRefreshedAt?: Record<string, Date>;
  createdAt: Date;
  updatedAt: Date;
  schemaVersion: number;
}
