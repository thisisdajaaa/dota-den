import type { ObjectId } from "mongodb";
import type { SessionRecord } from "./identity.ports";
import type { User } from "./domain/user";

export const IDENTITY_SCHEMA_VERSION = 1;

export const IDENTITY_COLLECTIONS = {
  users: "users",
  sessions: "auth_sessions",
  nonces: "auth_nonces",
} as const;

export interface UserDocument {
  _id: ObjectId;
  schemaVersion: number;
  steamId64: string;
  accountId32: number;
  persona: User["persona"];
  settings: User["settings"];
  roles: Array<"admin">;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionDocument extends SessionRecord {
  schemaVersion: number;
}

/** OpenID nonces seen recently (replay protection). */
export interface NonceDocument {
  _id: string;
  expiresAt: Date;
}

/** Admin overview: one user with their session count and last activity. */
export interface AdminUserRow {
  userId: string;
  accountId32: number;
  createdAt: Date;
  isAdmin: boolean;
  profileVisibility: string;
  sessions: number;
  lastSeenAt: Date | null;
}
