import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionCheckMemo } from "@/common/providers/session-lane";

// The request's cookies, set per test (a guest page view, a QStash delivery, a cron run…).
let sessionCookie: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "dd_session" && sessionCookie !== undefined ? { value: sessionCookie } : undefined,
  }),
}));

const { asBackgroundWork, asGuestWork, isBackgroundWork } =
  await import("@/common/providers/background-work");
const { lane, registerSessionVerifier } = await import("@/common/providers/shared-gateway-options");

const REAL = "real-session-token";
const verify = vi.fn(async (token: string) => token === REAL);

beforeEach(() => {
  sessionCookie = undefined;
  verify.mockClear();
  registerSessionVerifier(verify);
});

describe("OpenDota budget lane", () => {
  it("bills a cookie-less request as a guest", async () => {
    expect(await lane()).toBe("guest");
  });

  it("bills a made-up sign-in cookie as a guest", async () => {
    sessionCookie = "anything-at-all";
    expect(await lane()).toBe("guest");
  });

  it("bills a real session as a member, checking it once a minute at most", async () => {
    sessionCookie = REAL;
    expect(await lane()).toBe("member");
    expect(await lane()).toBe("member");
    expect(verify).toHaveBeenCalledTimes(1);
  });

  it("trusts the cookie when the session store can't be reached", async () => {
    sessionCookie = "while-the-database-is-down";
    registerSessionVerifier(async () => {
      throw new Error("db down");
    });
    expect(await lane()).toBe("member");
  });

  it("bills verified background work as a member, including work it awaits", async () => {
    await asBackgroundWork(async () => {
      expect(isBackgroundWork()).toBe(true);
      await Promise.resolve();
      expect(await lane()).toBe("member");
    });
    // The mark ends with the work.
    expect(isBackgroundWork()).toBe(false);
    expect(await lane()).toBe("guest");
  });

  it("bills guest-marked work (preview images) as a guest even when signed in", async () => {
    sessionCookie = REAL;
    await asGuestWork(async () => {
      expect(isBackgroundWork()).toBe(false);
      expect(await lane()).toBe("guest");
    });
    expect(await lane()).toBe("member");
  });
});

describe("SessionCheckMemo", () => {
  it("remembers answers for the TTL, then asks again", async () => {
    let now = 0;
    const memo = new SessionCheckMemo({ ttlMs: 60_000, maxEntries: 10, now: () => now });
    const check = vi.fn(async () => true);
    await memo.signedIn("t", check);
    now = 59_999;
    await memo.signedIn("t", check);
    expect(check).toHaveBeenCalledTimes(1);
    now = 60_000;
    await memo.signedIn("t", check);
    expect(check).toHaveBeenCalledTimes(2);
  });

  it("stays bounded, dropping the oldest tokens first", async () => {
    const memo = new SessionCheckMemo({ ttlMs: 60_000, maxEntries: 3 });
    const check = vi.fn(async () => false);
    for (const t of ["a", "b", "c", "d"]) await memo.signedIn(t, check);
    expect(memo.size).toBe(3);
    await memo.signedIn("a", check);
    expect(check).toHaveBeenCalledTimes(5);
  });

  it("doesn't remember a failed check", async () => {
    const memo = new SessionCheckMemo();
    await expect(
      memo.signedIn("t", async () => {
        throw new Error("down");
      }),
    ).rejects.toThrow("down");
    expect(memo.size).toBe(0);
  });
});
