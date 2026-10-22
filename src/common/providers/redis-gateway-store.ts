import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { gunzip, gzip } from "node:zlib";
import type { GatewayResponse, SharedResponseCache, UpstreamBudget } from "./provider-gateway";

/** The slice of the Upstash client these adapters use (so tests can pass a fake). */
export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, opts: { px: number }): Promise<unknown>;
  incr(key: string): Promise<number>;
  pexpire(key: string, ms: number): Promise<unknown>;
}

/**
 * Stored entries larger than this (after compression) aren't shared: Upstash caps request
 * size, and a few responses are big (OpenDota's ability constants are about 1.3 MB of JSON).
 */
export const MAX_SHARED_BODY_BYTES = 512 * 1024;
/**
 * Entries larger than this are stored gzipped (base64, behind COMPRESSED_PREFIX): JSON
 * shrinks about five-fold. Smaller ones stay plain JSON, not worth the CPU.
 */
export const COMPRESS_OVER_BYTES = 16 * 1024;
/** Marks a gzipped entry; plain entries are JSON objects, so they start with "{". */
const COMPRESSED_PREFIX = "gz:";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

async function compress(raw: string): Promise<string> {
  return COMPRESSED_PREFIX + (await gzipAsync(raw)).toString("base64");
}

async function decompress(stored: string): Promise<string> {
  const zipped = Buffer.from(stored.slice(COMPRESSED_PREFIX.length), "base64");
  return (await gunzipAsync(zipped)).toString("utf8");
}

/**
 * Upstream responses shared by every instance. Keys are a hash of the URL, so API keys in
 * query strings never reach Redis.
 */
export class RedisResponseCache implements SharedResponseCache {
  constructor(
    private readonly redis: RedisLike,
    private readonly opts: { prefix: string; now?: () => number },
  ) {}

  private key(url: string): string {
    return `${this.opts.prefix}:${createHash("sha256").update(url).digest("hex")}`;
  }

  async get(url: string): Promise<{ value: GatewayResponse; expiresAt: number } | null> {
    const stored = await this.redis.get(this.key(url));
    if (!stored) return null;
    // Plain entries are read as before; a corrupt one throws and the gateway fails open.
    const raw = stored.startsWith(COMPRESSED_PREFIX) ? await decompress(stored) : stored;
    const parsed = JSON.parse(raw) as { value: GatewayResponse; expiresAt: number };
    return parsed && typeof parsed.expiresAt === "number" ? parsed : null;
  }

  async set(url: string, value: GatewayResponse, ttlMs: number, retainMs?: number): Promise<void> {
    const now = (this.opts.now ?? Date.now)();
    const raw = JSON.stringify({ value, expiresAt: now + ttlMs });
    const stored = Buffer.byteLength(raw) > COMPRESS_OVER_BYTES ? await compress(raw) : raw;
    // Checked after compression: that's what goes over the wire.
    if (Buffer.byteLength(stored) > MAX_SHARED_BODY_BYTES) return;
    // Kept past expiry (when asked) so the gateway can serve it if the upstream fails.
    await this.redis.set(this.key(url), stored, { px: Math.max(ttlMs, retainMs ?? ttlMs) });
  }
}

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 3_600_000;

/**
 * A global call budget for one upstream, shared by every instance: counters per minute and
 * per UTC day. Plain INCR counters, so a burst across instances can overshoot by a call or
 * two at a window edge; that's fine for staying under a provider's quota.
 */
/** Share of the daily OpenDota budget signed-out visitors may use. */
export const DEFAULT_GUEST_SHARE = 0.4;

export class RedisUpstreamBudget implements UpstreamBudget {
  constructor(
    private readonly redis: RedisLike,
    private readonly opts: {
      prefix: string;
      perMinute: number;
      perDay: number;
      now?: () => number;
      onExhausted?: (window: "minute" | "day" | "guest_day") => void;
      /**
       * Who the call is for. Signed-out visitors ("guest": crawlers, link previews, guests)
       * may use at most `guestShare` of the daily budget, so they can never use up what
       * signed-in players' syncs need. Without it every call is a member call.
       */
      lane?: () => Promise<"guest" | "member">;
      guestShare?: number;
    },
  ) {}

  private async count(key: string, ttlMs: number): Promise<number> {
    const n = await this.redis.incr(key);
    // First call in the window starts its expiry.
    if (n === 1) await this.redis.pexpire(key, ttlMs);
    return n;
  }

  async take(): Promise<{ allowed: boolean; retryAfterMs: number | null }> {
    const now = (this.opts.now ?? Date.now)();
    const minuteLeft = MINUTE_MS - (now % MINUTE_MS);
    const dayLeft = DAY_MS - (now % DAY_MS);
    const day = Math.floor(now / DAY_MS);
    if (this.opts.lane && (await this.opts.lane().catch(() => "member")) === "guest") {
      const cap = Math.floor(this.opts.perDay * (this.opts.guestShare ?? DEFAULT_GUEST_SHARE));
      // Checked first: a refused guest call doesn't count against everyone's budget.
      if ((await this.count(`${this.opts.prefix}:g:${day}`, dayLeft + 1_000)) > cap) {
        this.opts.onExhausted?.("guest_day");
        return { allowed: false, retryAfterMs: dayLeft };
      }
    }
    const [perMinute, perDay] = await Promise.all([
      this.count(`${this.opts.prefix}:m:${Math.floor(now / MINUTE_MS)}`, minuteLeft + 1_000),
      this.count(`${this.opts.prefix}:d:${day}`, dayLeft + 1_000),
    ]);
    if (perDay > this.opts.perDay) {
      this.opts.onExhausted?.("day");
      return { allowed: false, retryAfterMs: dayLeft };
    }
    if (perMinute > this.opts.perMinute) {
      this.opts.onExhausted?.("minute");
      return { allowed: false, retryAfterMs: minuteLeft };
    }
    return { allowed: true, retryAfterMs: null };
  }
}
