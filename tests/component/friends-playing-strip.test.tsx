import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FriendsPlayingDto } from "@/modules/presence/dtos/responses/friends-playing.dto";
import { FriendsPlayingStrip } from "@/modules/presence/ui/friends-playing-strip";

const playing: FriendsPlayingDto = {
  enabled: true,
  source: "steam_friends",
  friends: [
    {
      accountId32: 2,
      name: "Synthetic Carry",
      avatarUrl: null,
      status: "in_match",
      href: "/live/8000000002",
      live: true,
    },
    {
      accountId32: 1,
      name: null,
      avatarUrl: null,
      status: "in_game",
      href: "/players/1",
      live: false,
    },
  ],
};
const nobody: FriendsPlayingDto = { enabled: true, source: "steam_friends", friends: [] };

const envelope = (data: FriendsPlayingDto) =>
  new Response(JSON.stringify({ success: true, message: "OK", data, statusCode: 200 }), {
    status: 200,
  });

let visibility: DocumentVisibilityState = "visible";

describe("FriendsPlayingStrip", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    visibility = "visible";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("lists friends in Dota 2 with accessible links", () => {
    render(<FriendsPlayingStrip initial={playing} />);
    const strip = screen.getByRole("region", { name: "Friends playing now" });
    expect(strip).toHaveTextContent("2 friends in Dota 2");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(
      screen.getByRole("link", { name: "Synthetic Carry: In a match. Watch live" }),
    ).toHaveAttribute("href", "/live/8000000002");
    expect(
      screen.getByRole("link", { name: "Player 1: Playing Dota 2. View profile" }),
    ).toHaveAttribute("href", "/players/1");
    expect(strip).toHaveTextContent("From your Steam friends list.");
  });

  it("renders nothing and never polls when Steam isn't configured", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { container } = render(
      <FriendsPlayingStrip initial={{ enabled: false, source: null, friends: [] }} />,
    );
    expect(container).toBeEmptyDOMElement();
    act(() => void vi.advanceTimersByTime(5 * 60_000));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("polls while visible, skips hidden tabs and appears when someone starts playing", async () => {
    const fetch = vi.fn(async () => envelope(playing));
    vi.stubGlobal("fetch", fetch);
    const { container } = render(<FriendsPlayingStrip initial={nobody} />);
    expect(container).toBeEmptyDOMElement();

    visibility = "hidden";
    await act(async () => void vi.advanceTimersByTime(60_000));
    expect(fetch).not.toHaveBeenCalled();

    visibility = "visible";
    await act(async () => void (await vi.advanceTimersByTimeAsync(60_000)));
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/me/friends/playing",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(screen.getByRole("region", { name: "Friends playing now" })).toBeInTheDocument();
  });

  it("refreshes right away when the tab becomes visible after a while", async () => {
    const fetch = vi.fn(async () => envelope(nobody));
    vi.stubGlobal("fetch", fetch);
    render(<FriendsPlayingStrip initial={playing} />);
    visibility = "hidden";
    // Hidden for 90 s: interval ticks are skipped.
    await act(async () => void (await vi.advanceTimersByTimeAsync(90_000)));
    expect(fetch).not.toHaveBeenCalled();
    visibility = "visible";
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    // Nobody playing any more: the strip hides.
    expect(screen.queryByRole("region", { name: "Friends playing now" })).toBeNull();
  });

  it("hides the strip rather than show a stale status when a refresh fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 500 })),
    );
    render(<FriendsPlayingStrip initial={playing} />);
    await act(async () => void (await vi.advanceTimersByTimeAsync(60_000)));
    expect(screen.queryByRole("region", { name: "Friends playing now" })).toBeNull();
  });
});
