/** Caching shared by the streaming-site adapters (Twitch, Kick). */

/** A string store every server can read (Redis), with expiry. */
export interface SharedCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

/** A small per-instance cache with expiry; drops the oldest entry when full. */
export class TtlCache<V> {
  private readonly entries = new Map<string, { at: number; value: V }>();
  constructor(
    private readonly ttlMs: number,
    private readonly max: number,
  ) {}

  get(key: string): V | undefined {
    const e = this.entries.get(key);
    if (!e) return undefined;
    if (Date.now() - e.at >= this.ttlMs) {
      this.entries.delete(key);
      return undefined;
    }
    return e.value;
  }

  set(key: string, value: V): void {
    this.entries.delete(key);
    if (this.entries.size >= this.max) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, { at: Date.now(), value });
  }
}

/** Reads a JSON value from the shared cache; null when unset, unreadable or not configured. */
export async function sharedGet<T>(
  shared: SharedCache | undefined,
  key: string,
): Promise<T | null> {
  const raw = await shared?.get(key).catch(() => null);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Writes a JSON value to the shared cache; failures are ignored (it's only a cache). */
export async function sharedSet(
  shared: SharedCache | undefined,
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<void> {
  await shared?.set(key, JSON.stringify(value), ttlSeconds).catch(() => {});
}
