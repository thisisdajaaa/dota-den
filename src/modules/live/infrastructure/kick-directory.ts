import { z } from "zod";
import { logger } from "@/common/logging/logger";
import type { ChannelLookup, StreamDirectory } from "../live.ports";
import { CHANNEL_NAME, parseChannelName, platformImage } from "../domain/platform";
import { batches, type ChannelHit, type StreamChannel } from "../domain/streams";
import type { LiveStream } from "../domain/watch";
import { sharedGet, sharedSet, TtlCache, type SharedCache } from "./directory-cache";

/** Kick's category id for Dota 2 ("Dota", 3586, is a different, empty one). */
const DOTA_2_CATEGORY_ID = "14";
/** Kick answers at most 100 live streams per request, most watched first. */
const PAGE_SIZE = 100;
/** Same freshness as Twitch: the hub refreshes every minute. */
const CACHE_MS = 60_000;
const SEARCH_CACHE_MS = 120_000;
const SLUG_CACHE_MS = 60_000;
const AVATAR_CACHE_MS = 6 * 3_600_000;
const SEARCH_RESULTS = 20;
/** Slugs per /channels request. */
const SLUG_BATCH = 50;
const TIMEOUT_MS = 5_000;

const TokenSchema = z.object({ access_token: z.string().min(1), expires_in: z.number() });
/** Kick's ids are numbers; kept as strings like Twitch's. */
const UserId = z
  .union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)])
  .transform(String);
const text = z
  .string()
  .nullish()
  .transform((v) => v ?? "");
const LivestreamSchema = z.object({
  broadcaster_user_id: UserId,
  slug: z.string(),
  stream_title: text,
  language: text,
  has_mature_content: z.boolean().nullish(),
  viewer_count: z.number().nullish(),
  thumbnail: z.string().nullish(),
  started_at: z.string().nullish(),
  category: z.object({ name: z.string().nullish() }).nullish(),
  profile_picture: z.string().nullish(),
});
const ChannelSchema = z.object({
  broadcaster_user_id: UserId,
  slug: z.string(),
  stream_title: text,
  category: z.object({ name: z.string().nullish() }).nullish(),
  stream: z
    .object({
      is_live: z.boolean().nullish(),
      language: z.string().nullish(),
      start_time: z.string().nullish(),
      viewer_count: z.number().nullish(),
      thumbnail: z.string().nullish(),
    })
    .nullish(),
});
/** Each item is checked on its own: one odd entry doesn't hide the rest. */
const ListSchema = z.object({ data: z.array(z.unknown()) });

type Livestream = z.infer<typeof LivestreamSchema>;
type Channel = z.infer<typeof ChannelSchema>;

export interface KickOptions {
  clientId: string;
  clientSecret: string;
  /** Kick's public API, e.g. https://api.kick.com/public/v1. */
  apiBaseUrl: string;
  authUrl: string;
  /** Shares the stream list and search results between servers. Optional. */
  shared?: SharedCache;
}

/** Items that parse, skipping the rest (and channels whose slug can't be used here). */
function items<T extends { slug: string }>(body: unknown, schema: z.ZodType<T>): T[] {
  return ListSchema.parse(body).data.flatMap((raw) => {
    const r = schema.safeParse(raw);
    return r.success && parseChannelName("kick", r.data.slug) ? [r.data] : [];
  });
}

const toStream = (s: Livestream): LiveStream => ({
  platform: "kick",
  channel: s.slug.toLowerCase(),
  // Kick's public API has no display name: the slug is the channel's name.
  displayName: s.slug,
  title: s.stream_title,
  viewers: s.viewer_count ?? 0,
  language: s.language.toLowerCase(),
  userId: s.broadcaster_user_id,
  thumbnailUrl: platformImage(s.thumbnail),
  avatarUrl: platformImage(s.profile_picture),
  startedAt: s.started_at ?? null,
  gameName: s.category?.name || null,
});

const channelStream = (c: Channel, avatarUrl: string | null): LiveStream | null =>
  c.stream?.is_live
    ? {
        platform: "kick",
        channel: c.slug.toLowerCase(),
        displayName: c.slug,
        title: c.stream_title,
        viewers: c.stream.viewer_count ?? 0,
        language: (c.stream.language ?? "").toLowerCase(),
        userId: c.broadcaster_user_id,
        thumbnailUrl: platformImage(c.stream.thumbnail),
        avatarUrl,
        startedAt: c.stream.start_time ?? null,
        gameName: c.category?.name || null,
      }
    : null;

/**
 * Kick has no name search, so a query is tried as a slug: as typed, and with its spaces as
 * "_", "-" or nothing ("bad boy" → bad_boy, bad-boy, badboy).
 */
export function slugCandidates(query: string): string[] {
  const q = query.trim().toLowerCase();
  const tries = [q.replace(/\s+/g, "_"), q.replace(/\s+/g, "-"), q.replace(/\s+/g, "")];
  return [...new Set(tries)].filter((s) => CHANNEL_NAME.kick.test(s));
}

const STREAMS_KEY = "dd:kick:dota-streams:v1";
const searchKey = (q: string, liveOnly: boolean) =>
  `dd:kick:search:${liveOnly ? 1 : 0}:${encodeURIComponent(q)}`;

/**
 * The Kick directory: live Dota 2 streams and channel lookups from Kick's public API, with an
 * app access token (client credentials). Streams marked mature are left out of the list.
 * Cached per instance and, when configured, across servers; methods return null when Kick is
 * unavailable.
 */
export class KickDirectory implements StreamDirectory {
  readonly platform = "kick" as const;
  private token: { value: string; expiresAt: number } | null = null;
  private cache: { at: number; streams: LiveStream[] } | null = null;
  private readonly searches = new TtlCache<ChannelHit[]>(SEARCH_CACHE_MS, 500);
  private readonly slugs = new TtlCache<LiveStream | null>(SLUG_CACHE_MS, 5_000);
  /** Profile pictures by user id: only the live-stream list carries them. */
  private readonly avatars = new TtlCache<string | null>(AVATAR_CACHE_MS, 5_000);

  constructor(private readonly opts: KickOptions) {}

  async liveDotaStreams(): Promise<LiveStream[] | null> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.streams;
    const shared = await sharedGet<LiveStream[]>(this.opts.shared, STREAMS_KEY);
    if (shared) {
      this.remember(shared);
      return shared;
    }
    try {
      const url = this.url("/livestreams");
      url.searchParams.set("category_id", DOTA_2_CATEGORY_ID);
      url.searchParams.set("limit", String(PAGE_SIZE));
      url.searchParams.set("sort", "viewer_count");
      const streams = items(await this.get(url), LivestreamSchema)
        .filter((s) => !s.has_mature_content)
        .map(toStream);
      const unique = [...new Map(streams.map((s) => [s.channel, s])).values()];
      this.remember(unique);
      await sharedSet(this.opts.shared, STREAMS_KEY, unique, CACHE_MS / 1000);
      return unique;
    } catch (err) {
      this.warn("kick_streams_failed", err);
      return this.cache?.streams ?? null;
    }
  }

  /**
   * Kick's API can't search by name: a channel is found by its exact slug, or, while it's
   * live in Dota 2, by any part of its name or title. Exact matches come first.
   */
  async searchChannels(query: string, liveOnly: boolean): Promise<ChannelHit[] | null> {
    const q = query.trim().toLowerCase();
    const key = searchKey(q, liveOnly);
    const cached = this.searches.get(key) ?? (await sharedGet<ChannelHit[]>(this.opts.shared, key));
    if (cached) {
      this.searches.set(key, cached);
      return cached;
    }
    const [streams, exact] = await Promise.all([
      this.liveDotaStreams(),
      this.channelsBySlug(slugCandidates(q)).catch((err) => {
        this.warn("kick_search_failed", err);
        return null;
      }),
    ]);
    if (streams === null && exact === null) return null;

    const hits = new Map<string, ChannelHit>();
    for (const c of exact ?? []) {
      const live = !!c.stream?.is_live;
      if (liveOnly && !live) continue;
      hits.set(c.broadcaster_user_id, {
        platform: "kick",
        id: c.broadcaster_user_id,
        login: c.slug.toLowerCase(),
        displayName: c.slug,
        avatarUrl: this.avatars.get(c.broadcaster_user_id) ?? null,
        live,
        title: c.stream_title,
        gameName: c.category?.name || null,
        language: c.stream?.language || null,
      });
    }
    for (const s of streams ?? []) {
      if (!s.userId || hits.has(s.userId)) continue;
      if (![s.channel, s.displayName, s.title].some((v) => v.toLowerCase().includes(q))) continue;
      hits.set(s.userId, {
        platform: "kick",
        id: s.userId,
        login: s.channel,
        displayName: s.displayName,
        avatarUrl: s.avatarUrl ?? null,
        live: true,
        title: s.title,
        gameName: s.gameName ?? null,
        language: s.language || null,
      });
    }
    const result = [...hits.values()].slice(0, SEARCH_RESULTS);
    // A partial answer (one of the two lookups failed) isn't kept.
    if (streams !== null && exact !== null) {
      this.searches.set(key, result);
      await sharedSet(this.opts.shared, key, result, SEARCH_CACHE_MS / 1000);
    }
    return result;
  }

  async liveByChannels(channels: readonly string[]): Promise<Map<string, LiveStream> | null> {
    const wanted = [...new Set(channels.map((c) => c.toLowerCase()))];
    const live = new Map<string, LiveStream>();
    const missing: string[] = [];
    for (const slug of wanted) {
      const cached = this.slugs.get(slug);
      if (cached === undefined) missing.push(slug);
      else if (cached) live.set(slug, cached);
    }
    try {
      for (const batch of batches(missing, SLUG_BATCH)) {
        const found = new Map(
          (await this.channelsBySlug(batch)).map((c) => [
            c.slug.toLowerCase(),
            channelStream(c, this.avatars.get(c.broadcaster_user_id) ?? null),
          ]),
        );
        for (const slug of batch) {
          const stream = found.get(slug) ?? null;
          this.slugs.set(slug, stream);
          if (stream) live.set(slug, stream);
        }
      }
      return live;
    } catch (err) {
      this.warn("kick_live_lookup_failed", err);
      return null;
    }
  }

  async channelById(id: string): Promise<ChannelLookup> {
    try {
      const url = this.url("/channels");
      url.searchParams.set("broadcaster_user_id", id);
      const c = items(await this.get(url), ChannelSchema).find((x) => x.broadcaster_user_id === id);
      if (!c) return { status: "not_found" };
      const channel: StreamChannel = {
        platform: "kick",
        id: c.broadcaster_user_id,
        login: c.slug.toLowerCase(),
        displayName: c.slug,
        avatarUrl: await this.avatarOf(c),
      };
      return { status: "found", channel };
    } catch (err) {
      this.warn("kick_channel_lookup_failed", err);
      return { status: "unavailable" };
    }
  }

  /**
   * A channel's profile picture: only Kick's live-stream list has it, so offline channels
   * have none (the UI shows initials). Best effort.
   */
  private async avatarOf(c: Channel): Promise<string | null> {
    const known = this.avatars.get(c.broadcaster_user_id);
    if (known !== undefined || !c.stream?.is_live) return known ?? null;
    try {
      const url = this.url("/livestreams");
      url.searchParams.set("broadcaster_user_id", c.broadcaster_user_id);
      const s = items(await this.get(url), LivestreamSchema)[0];
      const avatar = platformImage(s?.profile_picture);
      this.avatars.set(c.broadcaster_user_id, avatar);
      return avatar;
    } catch {
      return null;
    }
  }

  private async channelsBySlug(slugs: readonly string[]): Promise<Channel[]> {
    if (slugs.length === 0) return [];
    const url = this.url("/channels");
    for (const slug of slugs) url.searchParams.append("slug", slug);
    return items(await this.get(url), ChannelSchema);
  }

  private remember(streams: LiveStream[]): void {
    this.cache = { at: Date.now(), streams };
    for (const s of streams) if (s.userId) this.avatars.set(s.userId, s.avatarUrl ?? null);
  }

  private url(path: string): URL {
    return new URL(`${this.opts.apiBaseUrl}${path}`);
  }

  private warn(event: string, err: unknown): void {
    logger.warn(event, { reason: err instanceof Error ? err.message : "unknown" });
  }

  private async get(url: URL, retried = false): Promise<unknown> {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${await this.accessToken()}`, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    // A revoked or expired token: get a new one, once.
    if (res.status === 401 && !retried) {
      this.token = null;
      return this.get(url, true);
    }
    if (!res.ok) throw new Error(`kick ${res.status}`);
    return res.json();
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const res = await fetch(this.opts.authUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: this.opts.clientId,
        client_secret: this.opts.clientSecret,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`kick auth ${res.status}`);
    const body = TokenSchema.parse(await res.json());
    this.token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
    return body.access_token;
  }
}
