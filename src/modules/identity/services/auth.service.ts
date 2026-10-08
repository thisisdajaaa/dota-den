import { err, ok, type Result } from "@/common/result";
import type { User } from "../domain/user";
import type {
  IdentityProvider,
  IdentityVerificationError,
  PersonaLookup,
  SessionRecord,
  SessionRepository,
  UserRepository,
} from "../identity.ports";
import { generateToken, hashToken, safeEqual } from "../domain/session-tokens";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_ROTATE_AFTER_MS = 24 * 60 * 60 * 1000;
export const CALLBACK_PATH = "/api/v1/auth/steam/callback";
/** Steam names change; refresh the stored one at most this often. */
export const PERSONA_REFRESH_MS = 7 * 24 * 60 * 60 * 1000;
/** Sign-in never waits longer than this for the name lookup. */
export const PERSONA_TIMEOUT_MS = 2000;

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
  /** Optional: fills in the Steam name and avatar shown in the admin page and elsewhere. */
  persona?: PersonaLookup;
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
    return ok({ user: await this.refreshPersona(user, now), session });
  }

  /** Best effort: a slow or failed lookup keeps the stored persona and never blocks sign-in. */
  private async refreshPersona(user: User, now: Date): Promise<User> {
    const lookup = this.deps.persona;
    const age = user.persona ? now.getTime() - user.persona.capturedAt.getTime() : Infinity;
    if (!lookup || age < PERSONA_REFRESH_MS) return user;
    const timeout = new Promise<null>((resolve) => setTimeout(resolve, PERSONA_TIMEOUT_MS, null));
    const found = await Promise.race([lookup(user.accountId32).catch(() => null), timeout]);
    if (!found) return user;
    const persona = { name: found.name, avatarUrl: found.avatarUrl, capturedAt: now };
    await this.deps.users.setPersona(user.id, persona);
    return { ...user, persona };
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
