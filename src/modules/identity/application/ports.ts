import type { Result } from "@/modules/shared/domain/result";
import type { SteamId64 } from "../domain/steam-id";
import type { User } from "../domain/user";

export type IdentityVerificationError =
  | { type: "not_positive_assertion"; mode: string | null }
  | { type: "invalid_op_endpoint" }
  | { type: "return_to_mismatch" }
  | { type: "missing_signed_fields"; missing: string[] }
  | { type: "invalid_claimed_id" }
  | { type: "stale_nonce" }
  | { type: "replayed_nonce" }
  | { type: "provider_rejected" }
  | { type: "provider_unavailable"; cause: string };

export interface IdentityProvider {
  /** URL to send the browser to. `returnTo` must be an absolute URL on our origin. */
  buildAuthorizationUrl(input: { returnTo: string; realm: string }): string;
  /** Verify a callback. Must perform provider-side verification before returning ok. */
  verifyCallback(input: {
    params: URLSearchParams;
    expectedReturnTo: string;
  }): Promise<Result<SteamId64, IdentityVerificationError>>;
}

export interface UserRepository {
  upsertBySteamId(input: { steamId64: SteamId64; isAdmin: boolean; now: Date }): Promise<User>;
  findById(id: string): Promise<User | null>;
}

export interface SessionRecord {
  tokenHash: string;
  userId: string;
  createdAt: Date;
  rotatedAt: Date;
  expiresAt: Date;
}

export interface SessionRepository {
  create(record: SessionRecord): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  /** Atomically replace a session token. Returns false if the old one no longer exists. */
  replace(oldTokenHash: string, next: SessionRecord): Promise<boolean>;
  delete(tokenHash: string): Promise<void>;
}

export interface NonceStore {
  /** Record the nonce. Returns false if it was already seen. */
  consume(nonce: string, expiresAt: Date): Promise<boolean>;
}
