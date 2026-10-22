import { createHash } from "node:crypto";

/** Whether a sign-in token belongs to a live session. Throws when it can't tell. */
export type SessionVerifier = (token: string) => Promise<boolean>;

/**
 * Remembers recent answers per token, so budget checks (one per upstream call) don't each
 * cost a session lookup. Keyed by a hash: tokens never sit in memory as map keys. Bounded:
 * the oldest entries go first, so a flood of made-up cookies can't grow it.
 */
export class SessionCheckMemo {
  private readonly entries = new Map<string, { signedIn: boolean; expiresAt: number }>();

  constructor(
    private readonly opts: { ttlMs: number; maxEntries: number; now?: () => number } = {
      ttlMs: 60_000,
      maxEntries: 5_000,
    },
  ) {}

  private now(): number {
    return (this.opts.now ?? Date.now)();
  }

  /** Whether `token` is signed in, from memory when checked in the last `ttlMs`. */
  async signedIn(token: string, verify: SessionVerifier): Promise<boolean> {
    const key = createHash("sha256").update(token).digest("hex");
    const hit = this.entries.get(key);
    if (hit && hit.expiresAt > this.now()) return hit.signedIn;
    // A failed lookup throws past this point and is not remembered.
    const signedIn = await verify(token);
    this.entries.delete(key);
    this.entries.set(key, { signedIn, expiresAt: this.now() + this.opts.ttlMs });
    while (this.entries.size > this.opts.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
    return signedIn;
  }

  get size(): number {
    return this.entries.size;
  }
}
