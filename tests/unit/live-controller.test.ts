import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/common/cache/redis", () => ({ getRedis: () => null }));
vi.mock("@/common/config/env", () => ({ env: () => ({ APP_URL: "http://localhost:3000" }) }));
// Signed in when the request carries a session cookie (the real guard reads the session).
vi.mock("@/modules/identity", async () => {
  const { UnauthorizedError } = await import("@/common/errors/app-error");
  return {
    requireUser: async (req: NextRequest) => {
      const id = req.cookies.get("session")?.value;
      if (!id) throw new UnauthorizedError();
      return { id, accountId32: 1 };
    },
  };
});

const { LiveController } = await import("@/modules/live/live.controller");
const { UpstreamUnavailableError } = await import("@/common/errors/app-error");

const ORIGIN = "http://localhost:3000";
const request = (
  method: string,
  path: string,
  opts: { body?: unknown; origin?: string; user?: string } = {},
) =>
  new NextRequest(`${ORIGIN}${path}`, {
    method,
    headers: {
      origin: opts.origin ?? ORIGIN,
      "content-type": "application/json",
      ...(opts.user ? { cookie: `session=${opts.user}` } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });

function setup() {
  const calls: unknown[][] = [];
  const follows = {
    follow: vi.fn(async (owner: unknown, input: { channelId: string; login: string }) => {
      calls.push(["follow", owner, input]);
      return {
        created: true,
        follow: {
          userId: "u1",
          platform: "twitch",
          channelId: input.channelId,
          login: input.login,
          displayName: "Gorgc",
          avatarUrl: null,
          createdAt: new Date("2026-10-01T00:00:00Z"),
        },
      };
    }),
    unfollow: vi.fn(async () => true),
    following: vi.fn(async () => []),
  };
  const live = {
    searchChannels: vi.fn(async (q: string) => {
      if (q === "down")
        throw new UpstreamUnavailableError("Twitch search is unavailable right now");
      return [
        {
          id: "1",
          login: q,
          displayName: q,
          avatarUrl: null,
          live: true,
          title: "",
          gameName: null,
          language: null,
        },
      ];
    }),
  };
  const controller = new LiveController({ live: live as never, follows: follows as never });
  return { controller, follows, live, calls };
}

const route = (channelId: string, platform = "twitch") => ({
  params: Promise.resolve({ platform, channelId }),
});
const valid = { platform: "twitch", channelId: "123", login: "gorgc", displayName: "Gorgc" };

describe("LiveController: follows", () => {
  it("needs a signed-in user for every follow endpoint", async () => {
    const { controller, follows } = setup();
    expect((await controller.listFollows(request("GET", "/api/v1/me/streamers"))).status).toBe(401);
    expect(
      (await controller.follow(request("POST", "/api/v1/me/streamers", { body: valid }))).status,
    ).toBe(401);
    expect(
      (
        await controller.unfollow(
          request("DELETE", "/api/v1/me/streamers/twitch/123"),
          route("123"),
        )
      ).status,
    ).toBe(401);
    expect(follows.follow).not.toHaveBeenCalled();
  });

  it("refuses mutations from another origin, even when signed in", async () => {
    const { controller, follows } = setup();
    const cross = await controller.follow(
      request("POST", "/api/v1/me/streamers", {
        body: valid,
        user: "u1",
        origin: "https://evil.example",
      }),
    );
    expect(cross.status).toBe(403);
    const crossDelete = await controller.unfollow(
      request("DELETE", "/api/v1/me/streamers/twitch/123", {
        user: "u1",
        origin: "https://evil.example",
      }),
      route("123"),
    );
    expect(crossDelete.status).toBe(403);
    expect(follows.follow).not.toHaveBeenCalled();
    expect(follows.unfollow).not.toHaveBeenCalled();
  });

  it("validates the channel", async () => {
    const { controller } = setup();
    for (const body of [
      { ...valid, channelId: "abc" },
      { ...valid, login: "no spaces" },
      // Hyphens are fine in Kick slugs, not in Twitch logins.
      { ...valid, login: "has-hyphen" },
      { ...valid, platform: "youtube" },
      { ...valid, displayName: "" },
      { ...valid, extra: true },
      null,
    ]) {
      const res = await controller.follow(
        request("POST", "/api/v1/me/streamers", { body, user: "u1" }),
      );
      expect(res.status).toBe(400);
    }
    const badId = await controller.unfollow(
      request("DELETE", "/api/v1/me/streamers/twitch/x", { user: "u1" }),
      route("x"),
    );
    expect(badId.status).toBe(400);
    const badSite = await controller.unfollow(
      request("DELETE", "/api/v1/me/streamers/youtube/1", { user: "u1" }),
      route("1", "youtube"),
    );
    expect(badSite.status).toBe(400);
    const kick = await controller.follow(
      request("POST", "/api/v1/me/streamers", {
        body: { ...valid, platform: "kick", login: "has-hyphen" },
        user: "u1",
      }),
    );
    expect(kick.status).toBe(201);
  });

  it("follows and unfollows for the signed-in user, never echoing their id", async () => {
    const { controller, follows } = setup();
    const res = await controller.follow(
      request("POST", "/api/v1/me/streamers", { body: valid, user: "u1" }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data).toEqual({
      platform: "twitch",
      channelId: "123",
      login: "gorgc",
      displayName: "Gorgc",
      avatarUrl: null,
      createdAt: "2026-10-01T00:00:00.000Z",
    });
    expect(follows.follow).toHaveBeenCalledWith({ userId: "u1", accountId32: 1 }, valid);

    const del = await controller.unfollow(
      request("DELETE", "/api/v1/me/streamers/twitch/123", { user: "u1" }),
      route("123"),
    );
    expect(del.status).toBe(200);
    expect(follows.unfollow).toHaveBeenCalledWith(
      { userId: "u1", accountId32: 1 },
      "twitch",
      "123",
    );
  });
});

describe("LiveController: channel search", () => {
  it("is public, validates the query and reports Twitch outages", async () => {
    const { controller, live } = setup();
    const ok = await controller.searchChannels(
      request("GET", "/api/v1/live/channels?q=gorgc&live=1"),
    );
    expect(ok.status).toBe(200);
    expect(live.searchChannels).toHaveBeenCalledWith("gorgc", true);
    expect(ok.headers.get("cache-control")).toContain("max-age=60");

    for (const q of ["", "a", "x".repeat(51)])
      expect(
        (await controller.searchChannels(request("GET", `/api/v1/live/channels?q=${q}`))).status,
      ).toBe(400);

    const down = await controller.searchChannels(request("GET", "/api/v1/live/channels?q=down"));
    expect(down.status).toBe(503);
  });
});
