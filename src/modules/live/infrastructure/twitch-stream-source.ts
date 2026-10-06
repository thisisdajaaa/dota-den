import { z } from "zod";
import { logger } from "@/common/logging/logger";
import type { StreamSource } from "../live.ports";
import type { LiveStream } from "../domain/watch";

/** Twitch's category id for Dota 2. */
const DOTA_2_GAME_ID = "29595";
/** Top streams by viewers; tournament broadcasts are always near the top. */
const PAGES = 3;
const CACHE_MS = 60_000;
const TIMEOUT_MS = 5_000;

const TokenSchema = z.object({ access_token: z.string(), expires_in: z.number() });
const StreamsSchema = z.object({
  data: z.array(
    z.object({
      user_login: z.string(),
      user_name: z.string(),
      title: z.string(),
      viewer_count: z.number(),
      language: z.string(),
    }),
  ),
  pagination: z.object({ cursor: z.string().optional() }).optional(),
});

export interface TwitchOptions {
  clientId: string;
  clientSecret: string;
  apiBaseUrl: string;
  authUrl: string;
}

/**
 * Live Dota 2 streams from the Twitch Helix API, with an app access token (client
 * credentials). Cached per instance; returns null when Twitch is unavailable.
 */
export class TwitchStreamSource implements StreamSource {
  private token: { value: string; expiresAt: number } | null = null;
  private cache: { at: number; streams: LiveStream[] } | null = null;

  constructor(private readonly opts: TwitchOptions) {}

  async dotaStreams(): Promise<LiveStream[] | null> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.streams;
    try {
      const streams: LiveStream[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < PAGES; page++) {
        const url = new URL(`${this.opts.apiBaseUrl}/streams`);
        url.searchParams.set("game_id", DOTA_2_GAME_ID);
        url.searchParams.set("first", "100");
        if (cursor) url.searchParams.set("after", cursor);
        const body = StreamsSchema.parse(await this.get(url));
        streams.push(
          ...body.data.map((s) => ({
            channel: s.user_login,
            displayName: s.user_name,
            title: s.title,
            viewers: s.viewer_count,
            language: s.language,
          })),
        );
        cursor = body.pagination?.cursor;
        if (!cursor || body.data.length < 100) break;
      }
      this.cache = { at: Date.now(), streams };
      return streams;
    } catch (err) {
      logger.warn("twitch_streams_failed", {
        reason: err instanceof Error ? err.message : "unknown",
      });
      return this.cache?.streams ?? null;
    }
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
