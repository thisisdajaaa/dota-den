import { err, ok, type Result } from "@/modules/shared/domain/result";
import type { User } from "../domain/user";
import type {
  IdentityProvider,
  IdentityVerificationError,
  SessionRecord,
  SessionRepository,
  UserRepository,
} from "./ports";
import { generateToken, hashToken, safeEqual } from "./session-tokens";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_ROTATE_AFTER_MS = 24 * 60 * 60 * 1000;
export const CALLBACK_PATH = "/api/v1/auth/steam/callback";

export type SignInError = { type: "state_mismatch" } | IdentityVerificationError;

export interface IssuedSession {
  token: string;
  expiresAt: Date;
}

export interface AuthServiceDeps {
  provider: IdentityProvider;
  users: UserRepository;
  sessions: SessionRepository;
  appUrl: string;
  adminSteamIds: readonly string[];
  now?: () => Date;
}

export class AuthService {
  private readonly now: () => Date;

  constructor(private readonly deps: AuthServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  private returnTo(state: string): string {
    const url = new URL(CALLBACK_PATH, this.deps.appUrl);
    url.searchParams.set("state", state);
    return url.toString();
  }

  beginSignIn(): { redirectUrl: string; state: string } {
    const state = generateToken(16);
    const realm = new URL(this.deps.appUrl).origin + "/";
    const redirectUrl = this.deps.provider.buildAuthorizationUrl({
      returnTo: this.returnTo(state),
      realm,
    });
    return { redirectUrl, state };
  }

  async completeSignIn(input: {
    params: URLSearchParams;
    cookieState: string | undefined;
  }): Promise<Result<{ user: User; session: IssuedSession }, SignInError>> {
    const queryState = input.params.get("state");
    if (!queryState || !input.cookieState || !safeEqual(queryState, input.cookieState)) {
      return err({ type: "state_mismatch" });
    }
    const verified = await this.deps.provider.verifyCallback({
      params: input.params,
      expectedReturnTo: this.returnTo(queryState),
    });
    if (!verified.ok) return verified;

    const now = this.now();
    const user = await this.deps.users.upsertBySteamId({
      steamId64: verified.value,
      isAdmin: this.deps.adminSteamIds.includes(verified.value),
      now,
    });
    const session = await this.issueSession(user.id, now);
    return ok({ user, session });
  }

  /**
   * Resolve a session cookie. Returns a replacement token when the session is due for
   * rotation; callers that can set cookies should persist it.
   */
  async resolveSession(
    token: string | undefined,
    opts: { rotate: boolean } = { rotate: false },
  ): Promise<{ user: User; rotated: IssuedSession | null } | null> {
    if (!token) return null;
    const now = this.now();
    const hash = hashToken(token);
    const record = await this.deps.sessions.findByTokenHash(hash);
    if (!record || record.expiresAt <= now) return null;

    const user = await this.deps.users.findById(record.userId);
    if (!user) return null;

    let rotated: IssuedSession | null = null;
    if (opts.rotate && now.getTime() - record.rotatedAt.getTime() > SESSION_ROTATE_AFTER_MS) {
      const next = this.newRecord(user.id, now, record.createdAt);
      if (await this.deps.sessions.replace(hash, next.record)) rotated = next.issued;
    }
    return { user, rotated };
  }

  async signOut(token: string | undefined): Promise<void> {
    if (token) await this.deps.sessions.delete(hashToken(token));
  }

  private async issueSession(userId: string, now: Date): Promise<IssuedSession> {
    const { record, issued } = this.newRecord(userId, now, now);
    await this.deps.sessions.create(record);
    return issued;
  }

  private newRecord(
    userId: string,
    now: Date,
    createdAt: Date,
  ): { record: SessionRecord; issued: IssuedSession } {
    const token = generateToken();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    return {
      record: { tokenHash: hashToken(token), userId, createdAt, rotatedAt: now, expiresAt },
      issued: { token, expiresAt },
    };
  }
}
