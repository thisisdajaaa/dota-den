import { z } from "zod";
import type { ProviderGateway } from "@/common/providers/provider-gateway";
import { meaningfulSteamId, SUMMARIES_BATCH, type SteamPresence } from "../domain/presence";
import type { FriendList, SteamPresenceSource } from "../presence.ports";

/** Presence changes by the minute; the strip refreshes about as often. */
const SUMMARIES_TTL_MS = 60_000;
/** Friend lists change rarely. */
const FRIEND_LIST_TTL_MS = 10 * 60_000;
/** A private friend list is asked about again after this long (Steam answers 401). */
const PRIVATE_TTL_MS = 10 * 60_000;

const steamId = z.string().regex(/^7656119\d{10}$/);

const FriendListSchema = z.object({
  friendslist: z
    .object({
      friends: z
        .array(z.object({ steamid: z.unknown(), relationship: z.unknown().optional() }))
        .default([]),
    })
    .default({ friends: [] }),
});

const PresenceRow = z.object({
  steamid: steamId,
  communityvisibilitystate: z.coerce.number().int(),
  personastate: z.coerce.number().int().optional(),
  personaname: z.string().optional(),
  avatarfull: z.string().optional(),
  gameid: z.union([z.string(), z.number()]).transform(String).optional(),
  gameserversteamid: z.union([z.string(), z.number()]).transform(String).optional(),
});
const SummariesSchema = z.object({
  response: z.object({ players: z.array(z.unknown()).default([]) }),
});

/** Steam avatars only (the host next/image allows); anything else becomes null. */
export function steamAvatar(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === "avatars.steamstatic.com" && !u.username
      ? u.toString()
      : null;
  } catch {
    return null;
  }
}

/** ISteamUser over the Steam Web API: friend lists and public presence, zod-checked. */
export class SteamPresenceAdapter implements SteamPresenceSource {
  private readonly privateUntil = new Map<string, number>();

  constructor(
    private readonly gateway: ProviderGateway,
    private readonly opts: { baseUrl: string; apiKey: string; now?: () => number },
  ) {}

  private get now(): number {
    return (this.opts.now ?? Date.now)();
  }

  private url(path: string, params: Record<string, string>): string {
    const u = new URL(`${this.opts.baseUrl.replace(/\/$/, "")}${path}`);
    u.searchParams.set("key", this.opts.apiKey);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    return u.toString();
  }

  async friendList(steamId64: string): Promise<FriendList> {
    if ((this.privateUntil.get(steamId64) ?? 0) > this.now) return { kind: "private" };
    const res = await this.gateway.getJson(
      this.url("/ISteamUser/GetFriendList/v1/", { steamid: steamId64, relationship: "friend" }),
      // A private list is a 401 for this account, not Steam failing: keep the circuit closed.
      { cacheTtlMs: FRIEND_LIST_TTL_MS, isolated: true },
    );
    if (!res.ok) {
      // Steam answers 401 for a private friend list (and 404 when there is nothing to show).
      if (res.kind === "not_found" || (res.kind === "failed" && res.status === 401)) {
        this.privateUntil.set(steamId64, this.now + PRIVATE_TTL_MS);
        if (this.privateUntil.size > 10_000) this.privateUntil.clear();
        return { kind: "private" };
      }
      return { kind: "unavailable" };
    }
    const parsed = FriendListSchema.safeParse(res.body);
    if (!parsed.success) return { kind: "unavailable" };
    const steamIds = parsed.data.friendslist.friends
      .filter((f) => f.relationship === undefined || f.relationship === "friend")
      .map((f) => f.steamid)
      .filter((id): id is string => steamId.safeParse(id).success);
    return { kind: "public", steamIds: [...new Set(steamIds)] };
  }

  async summaries(steamIds: readonly string[]): Promise<SteamPresence[] | null> {
    const ids = [...new Set(steamIds)].filter((id) => steamId.safeParse(id).success);
    if (ids.length === 0) return [];
    if (ids.length > SUMMARIES_BATCH) throw new Error(`At most ${SUMMARIES_BATCH} ids per call`);
    const res = await this.gateway.getJson(
      this.url("/ISteamUser/GetPlayerSummaries/v2/", { steamids: ids.join(",") }),
      { cacheTtlMs: SUMMARIES_TTL_MS },
    );
    if (!res.ok) return null;
    const parsed = SummariesSchema.safeParse(res.body);
    if (!parsed.success) return null;
    // A malformed row is skipped: it never turns into a guessed status.
    return parsed.data.response.players.flatMap((raw) => {
      const row = PresenceRow.safeParse(raw);
      if (!row.success) return [];
      const r = row.data;
      const isPublic = r.communityvisibilitystate === 3;
      return [
        {
          steamId64: r.steamid,
          visibility: r.communityvisibilitystate,
          // Steam only exposes these for public profiles; never read them otherwise.
          personaState: isPublic ? (r.personastate ?? 0) : 0,
          name: r.personaname?.trim().slice(0, 64) || null,
          avatarUrl: steamAvatar(r.avatarfull),
          gameId: isPublic ? (r.gameid ?? null) : null,
          gameServerSteamId: isPublic ? meaningfulSteamId(r.gameserversteamid) : null,
        },
      ];
    });
  }
}
