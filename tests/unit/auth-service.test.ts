import { describe, expect, it } from "vitest";
import {
  AuthService,
  SESSION_ROTATE_AFTER_MS,
  SESSION_TTL_MS,
} from "@/modules/identity/services/auth.service";
import type {
  IdentityProvider,
  SessionRecord,
  SessionRepository,
  UserRepository,
} from "@/modules/identity/identity.ports";
import { hashToken } from "@/modules/identity/domain/session-tokens";
import { toAccountId32, type SteamId64 } from "@/modules/identity/domain/steam-id";
import { DEFAULT_USER_SETTINGS, type User } from "@/modules/identity/domain/user";
import { err, ok } from "@/common/result";

const APP_URL = "https://den.example";
const STEAM_ID = "76561197960287930" as SteamId64;

class InMemoryUsers implements UserRepository {
  users = new Map<string, User>();
  async upsertBySteamId({
    steamId64,
    isAdmin,
    now,
  }: {
    steamId64: SteamId64;
    isAdmin: boolean;
    now: Date;
  }) {
    const existing = [...this.users.values()].find((u) => u.steamId64 === steamId64);
    const user: User = existing
      ? { ...existing, roles: isAdmin ? ["admin"] : [], updatedAt: now }
      : {
          id: `u${this.users.size + 1}`,
          steamId64,
          accountId32: toAccountId32(steamId64),
          persona: null,
          settings: DEFAULT_USER_SETTINGS,
          roles: isAdmin ? ["admin"] : [],
          createdAt: now,
          updatedAt: now,
        };
    this.users.set(user.id, user);
    return user;
  }
  async findById(id: string) {
    return this.users.get(id) ?? null;
  }
}

class InMemorySessions implements SessionRepository {
  records = new Map<string, SessionRecord>();
  async create(r: SessionRecord) {
    this.records.set(r.tokenHash, r);
  }
  async findByTokenHash(h: string) {
    return this.records.get(h) ?? null;
  }
  async replace(old: string, next: SessionRecord) {
    if (!this.records.delete(old)) return false;
    this.records.set(next.tokenHash, next);
    return true;
  }
  async delete(h: string) {
    this.records.delete(h);
  }
}

function setup(opts: { verifyOk?: boolean; admins?: string[] } = {}) {
  let now = new Date("2026-09-29T12:00:00Z");
  const seenReturnTo: string[] = [];
  const provider: IdentityProvider = {
    buildAuthorizationUrl: ({ returnTo }) => {
      seenReturnTo.push(returnTo);
      return `https://steam.example/login?rt=${encodeURIComponent(returnTo)}`;
    },
    verifyCallback: async ({ expectedReturnTo }) => {
      seenReturnTo.push(expectedReturnTo);
      return opts.verifyOk === false ? err({ type: "provider_rejected" }) : ok(STEAM_ID);
    },
  };
  const users = new InMemoryUsers();
  const sessions = new InMemorySessions();
  const service = new AuthService({
    provider,
    users,
    sessions,
    appUrl: APP_URL,
    adminSteamIds: opts.admins ?? [],
    now: () => now,
  });
  return {
    service,
    users,
    sessions,
    seenReturnTo,
    advance: (ms: number) => (now = new Date(now.getTime() + ms)),
  };
}

async function signIn(ctx: ReturnType<typeof setup>) {
  const { state } = ctx.service.beginSignIn();
  return ctx.service.completeSignIn({ params: new URLSearchParams({ state }), cookieState: state });
}

describe("AuthService", () => {
  it("binds the return_to URL to a random state value", () => {
    const { service, seenReturnTo } = setup();
    const a = service.beginSignIn();
    const b = service.beginSignIn();
    expect(a.state).not.toBe(b.state);
    expect(seenReturnTo[0]).toBe(`${APP_URL}/api/v1/auth/steam/callback?state=${a.state}`);
  });

  it("rejects a callback whose state does not match the cookie", async () => {
    const ctx = setup();
    const { state } = ctx.service.beginSignIn();
    for (const cookieState of [undefined, "other"]) {
      const result = await ctx.service.completeSignIn({
        params: new URLSearchParams({ state }),
        cookieState,
      });
      expect(result).toEqual({ ok: false, error: { type: "state_mismatch" } });
    }
    expect(ctx.sessions.records.size).toBe(0);
  });

  it("creates one user and a hashed session on successful sign-in", async () => {
    const ctx = setup();
    const first = await signIn(ctx);
    const second = await signIn(ctx);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    expect(ctx.users.users.size).toBe(1);
    expect(first.value.user.id).toBe(second.value.user.id);
    expect(first.value.user.settings.profileVisibility).toBe("private");
    // The raw token is never stored.
    expect(ctx.sessions.records.has(first.value.session.token)).toBe(false);
    expect(ctx.sessions.records.has(hashToken(first.value.session.token))).toBe(true);
  });

  it("does not create a session when provider verification fails", async () => {
    const ctx = setup({ verifyOk: false });
    expect((await signIn(ctx)).ok).toBe(false);
    expect(ctx.sessions.records.size).toBe(0);
    expect(ctx.users.users.size).toBe(0);
  });

  it("grants admin only to configured SteamIDs", async () => {
    const admin = await signIn(setup({ admins: [STEAM_ID] }));
    const regular = await signIn(setup());
    expect(admin.ok && admin.value.user.roles).toEqual(["admin"]);
    expect(regular.ok && regular.value.user.roles).toEqual([]);
  });

  it("resolves a valid session and rejects unknown or expired tokens", async () => {
    const ctx = setup();
    const signedIn = await signIn(ctx);
    if (!signedIn.ok) throw new Error("sign-in failed");
    const token = signedIn.value.session.token;

    expect((await ctx.service.resolveSession(token))?.user.steamId64).toBe(STEAM_ID);
    expect(await ctx.service.resolveSession("not-a-token")).toBeNull();
    expect(await ctx.service.resolveSession(undefined)).toBeNull();

    ctx.advance(SESSION_TTL_MS + 1);
    expect(await ctx.service.resolveSession(token)).toBeNull();
  });

  it("rotates the token after 24h only when asked, invalidating the old one", async () => {
    const ctx = setup();
    const signedIn = await signIn(ctx);
    if (!signedIn.ok) throw new Error("sign-in failed");
    const token = signedIn.value.session.token;

    ctx.advance(SESSION_ROTATE_AFTER_MS + 1);
    expect((await ctx.service.resolveSession(token))?.rotated).toBeNull();

    const resolved = await ctx.service.resolveSession(token, { rotate: true });
    expect(resolved?.rotated).not.toBeNull();
    expect(await ctx.service.resolveSession(token)).toBeNull();
    expect((await ctx.service.resolveSession(resolved!.rotated!.token))?.user.id).toBe(
      resolved!.user.id,
    );
  });

  it("revokes the session on sign-out", async () => {
    const ctx = setup();
    const signedIn = await signIn(ctx);
    if (!signedIn.ok) throw new Error("sign-in failed");
    await ctx.service.signOut(signedIn.value.session.token);
    expect(await ctx.service.resolveSession(signedIn.value.session.token)).toBeNull();
  });
});
