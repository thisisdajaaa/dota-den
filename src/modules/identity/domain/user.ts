import type { AccountId32, SteamId64 } from "./steam-id";

export type ProfileVisibility = "private" | "friends" | "public";

export interface PersonaSnapshot {
  name: string;
  avatarUrl: string | null;
  capturedAt: Date;
}

export interface User {
  id: string;
  steamId64: SteamId64;
  accountId32: AccountId32;
  persona: PersonaSnapshot | null;
  settings: { profileVisibility: ProfileVisibility; timeZone: string | null };
  roles: ReadonlyArray<"admin">;
  createdAt: Date;
  updatedAt: Date;
}

/** Profiles and MMR are private by default (spec §5). */
export const DEFAULT_USER_SETTINGS: User["settings"] = {
  profileVisibility: "private",
  timeZone: null,
};
