import { z } from "zod";
import { logger } from "@/common/logging/logger";
import type { ChannelLookup, StreamDirectory } from "../live.ports";
import { platformImage } from "../domain/platform";
import { batches, type ChannelHit } from "../domain/streams";
import type { LiveStream } from "../domain/watch";
import { sharedGet, sharedSet, TtlCache, type SharedCache } from "./directory-cache";

/** Twitch's category id for Dota 2. */
const DOTA_2_GAME_ID = "29595";
/** Top streams by viewers; tournament broadcasts are always near the top. */
const PAGES = 3;
const CACHE_MS = 60_000;
/** Search results and live lookups of followed channels: brief, to absorb typing and refreshes. */
const SEARCH_CACHE_MS = 120_000;
const LOGIN_CACHE_MS = 60_000;
/** Avatars rarely change. */
const AVATAR_CACHE_MS = 6 * 3_600_000;
const SEARCH_RESULTS = 20;
const TIMEOUT_MS = 5_000;

const TokenSchema = z.object({ access_token: z.string(), expires_in: z.number() });
const StreamSchema = z.object({
  user_id: z.string().optional(),
  user_login: z.string(),
  user_name: z.string(),
  title: z.string(),
  viewer_count: z.number(),
  language: z.string(),
  thumbnail_url: z.string().optional(),
  started_at: z.string().optional(),
  game_name: z.string().optional(),
});
const StreamsSchema = z.object({
  data: z.array(StreamSchema),
  pagination: z.object({ cursor: z.string().optional() }).optional(),
});
const UsersSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      login: z.string(),
      display_name: z.string(),
      profile_image_url: z.string().optional(),
    }),
  ),
});
const SearchSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      broadcaster_login: z.string(),
      display_name: z.string(),
      is_live: z.boolean(),
      title: z.string().optional(),
      game_name: z.string().optional(),
      broadcaster_language: z.string().optional(),
      thumbnail_url: z.string().optional(),
    }),
  ),
});

export type LiveStreamList = LiveStream[];

export interface TwitchOptions {
  clientId: string;
  clientSecret: string;
  apiBaseUrl: string;
  authUrl: string;
  /** Shares the stream list and search results between servers. Optional. */
  shared?: SharedCache;
}

const toStream = (s: z.infer<typeof StreamSchema>): LiveStream => ({
  platform: "twitch",
  channel: s.user_login,
  displayName: s.user_name,
  title: s.title,
  viewers: s.viewer_count,
  language: s.language,
  userId: s.user_id,
  thumbnailUrl: platformImage(s.thumbnail_url),
  startedAt: s.started_at ?? null,
  gameName: s.game_name || null,
});

const STREAMS_KEY = "dd:twitch:dota-streams:v2";
const searchKey = (q: string, liveOnly: boolean) =>
  `dd:twitch:search:${liveOnly ? 1 : 0}:${encodeURIComponent(q)}`;

/**
 * The Twitch directory: live Dota 2 streams and channel lookups from the Twitch Helix API, with an app access token
 * (client credentials). Cached per instance and, when configured, across servers; methods
 * return null when Twitch is unavailable.
 */
export class TwitchDirectory implements StreamDirectory {
  readonly platform = "twitch" as const;
  private token: { value: string; expiresAt: number } | null = null;
  private cache: { at: number; streams: LiveStream[] } | null = null;
  private readonly searches = new TtlCache<ChannelHit[]>(SEARCH_CACHE_MS, 500);
  private readonly logins = new TtlCache<LiveStream | null>(LOGIN_CACHE_MS, 5_000);
  private readonly avatars = new TtlCache<string | null>(AVATAR_CACHE_MS, 5_000);

  constructor(private readonly opts: TwitchOptions) {}

  async liveDotaStreams(): Promise<LiveStream[] | null> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.streams;
    // Servers come and go on Vercel: share the list through Redis when it's set up.
    const shared = await this.sharedGet<LiveStream[]>(STREAMS_KEY);
    if (shared) {
      this.cache = { at: Date.now(), streams: shared };
      return shared;
    }
    try {
      const streams: LiveStream[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < PAGES; page++) {
        const url = this.url("/streams");
        url.searchParams.set("game_id", DOTA_2_GAME_ID);
        url.searchParams.set("first", "100");
        if (cursor) url.searchParams.set("after", cursor);
        const body = StreamsSchema.parse(await this.get(url));
        streams.push(...body.data.map(toStream));
        cursor = body.pagination?.cursor;
        if (!cursor || body.data.length < 100) break;
      }
      // A page boundary can repeat a channel whose viewer count moved.
      const unique = [...new Map(streams.map((s) => [s.channel, s])).values()];
      const withAvatars = await this.withAvatars(unique);
      this.cache = { at: Date.now(), streams: withAvatars };
      await this.sharedSet(STREAMS_KEY, withAvatars, CACHE_MS / 1000);
      return withAvatars;
    } catch (err) {
      this.warn("twitch_streams_failed", err);
      return this.cache?.streams ?? null;
    }
  }

  async searchChannels(query: string, liveOnly: boolean): Promise<ChannelHit[] | null> {
    const q = query.trim().toLowerCase();
    const key = searchKey(q, liveOnly);
    const cached = this.searches.get(key) ?? (await this.sharedGet<ChannelHit[]>(key));
    if (cached) {
      this.searches.set(key, cached);
      return cached;
    }
    try {
      const url = this.url("/search/channels");
      url.searchParams.set("query", q);
      url.searchParams.set("first", String(SEARCH_RESULTS));
      if (liveOnly) url.searchParams.set("live_only", "true");
      const body = SearchSchema.parse(await this.get(url));
      const hits: ChannelHit[] = body.data.map((c) => ({
        platform: "twitch",
        id: c.id,
        login: c.broadcaster_login,
        displayName: c.display_name,
        // Search results carry the profile picture as `thumbnail_url`.
        avatarUrl: platformImage(c.thumbnail_url),
        live: c.is_live,
        title: c.title ?? "",
        gameName: c.game_name || null,
        language: c.broadcaster_language || null,
      }));
      this.searches.set(key, hits);
      await this.sharedSet(key, hits, SEARCH_CACHE_MS / 1000);
      return hits;
    } catch (err) {
      this.warn("twitch_search_failed", err);
      return null;
    }
  }

  async liveByChannels(logins: readonly string[]): Promise<Map<string, LiveStream> | null> {
    const wanted = [...new Set(logins.map((l) => l.toLowerCase()))];
    const live = new Map<string, LiveStream>();
    const missing: string[] = [];
    for (const login of wanted) {
      const cached = this.logins.get(login);
      if (cached === undefined) missing.push(login);
      else if (cached) live.set(login, cached);
    }
    try {
      for (const batch of batches(missing, 100)) {
        const url = this.url("/streams");
        for (const login of batch) url.searchParams.append("user_login", login);
        url.searchParams.set("first", "100");
        const body = StreamsSchema.parse(await this.get(url));
        const found = new Map(body.data.map((s) => [s.user_login.toLowerCase(), toStream(s)]));
        for (const login of batch) {
          const stream = found.get(login) ?? null;
          this.logins.set(login, stream);
          if (stream) live.set(login, stream);
        }
      }
      return live;
    } catch (err) {
      this.warn("twitch_live_lookup_failed", err);
      return null;
    }
  }

  async channelById(id: string): Promise<ChannelLookup> {
    try {
      const users = await this.users([id]);
      const u = users[0];
      return u ? { status: "found", channel: u } : { status: "not_found" };
    } catch (err) {
      this.warn("twitch_user_lookup_failed", err);
      return { status: "unavailable" };
    }
  }

  /** Profile pictures for the streams (Helix /streams has none); left out when the lookup fails. */
  private async withAvatars(streams: LiveStream[]): Promise<LiveStream[]> {
    const ids = streams.map((s) => s.userId).filter((id): id is string => !!id);
    const missing = ids.filter((id) => this.avatars.get(id) === undefined);
    try {
      for (const batch of batches(missing, 100)) {
        const found = new Map((await this.users(batch)).map((u) => [u.id, u.avatarUrl]));
        for (const id of batch) this.avatars.set(id, found.get(id) ?? null);
      }
    } catch (err) {
      this.warn("twitch_avatars_failed", err);
    }
    return streams.map((s) => ({
      ...s,
      avatarUrl: (s.userId && this.avatars.get(s.userId)) || null,
    }));
  }

  private async users(ids: readonly string[]) {
    const url = this.url("/users");
    for (const id of ids) url.searchParams.append("id", id);
    const body = UsersSchema.parse(await this.get(url));
    return body.data.map((u) => ({
      platform: "twitch" as const,
      id: u.id,
      login: u.login,
      displayName: u.display_name,
      avatarUrl: platformImage(u.profile_image_url),
    }));
  }

  private url(path: string): URL {
    return new URL(`${this.opts.apiBaseUrl}${path}`);
  }

  private sharedGet<T>(key: string): Promise<T | null> {
    return sharedGet<T>(this.opts.shared, key);
  }

  private sharedSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    return sharedSet(this.opts.shared, key, value, ttlSeconds);
  }

  private warn(event: string, err: unknown): void {
    logger.warn(event, { reason: err instanceof Error ? err.message : "unknown" });
  }

  private async get(url: URL, retried = false): Promise<unknown> {
    const res = await fetch(url, {
      headers: {
        "Client-Id": this.opts.clientId,
        Authorization: `Bearer ${await this.accessToken()}`,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (res.status === 401 && !retried) {
      this.token = null;
      return this.get(url, true);
    }
    if (!res.ok) throw new Error(`twitch ${res.status}`);
    return res.json();
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const res = await fetch(this.opts.authUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.opts.clientId,
        client_secret: this.opts.clientSecret,
        grant_type: "client_credentials",
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`twitch auth ${res.status}`);
    const body = TokenSchema.parse(await res.json());
    this.token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
    return body.access_token;
  }
}
