import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AskStateDto } from "@/modules/assistant";
import { AskFab } from "@/modules/assistant/ui/ask-fab";

const nav = vi.hoisted(() => ({ pathname: "/dashboard" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));
// jsdom doesn't scroll.
Element.prototype.scrollTo = () => {};

const STATE: AskStateDto = {
  enabled: true,
  quota: { plus: false, limit: 5, used: 1, remaining: 4, resetsAt: "2026-11-24T16:00:00.000Z" },
  plusLimit: 100,
  conversations: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      title: "Wards",
      updatedAt: "2026-11-24T01:00:00.000Z",
      messages: 2,
    },
  ],
  conversationId: "11111111-1111-4111-8111-111111111111",
  messages: [
    {
      role: "user",
      text: "Where do I ward?",
      sources: [],
      fallback: false,
      at: "2026-11-24T01:00:00.000Z",
    },
  ],
};

const ok = (data: unknown) =>
  Response.json({ success: true, message: "OK", statusCode: 200, data });

describe("AskFab", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    nav.pathname = "/dashboard";
  });

  it("isn't shown on the Ask Den page itself", () => {
    nav.pathname = "/ask";
    render(<AskFab plusOnSale />);
    expect(screen.queryByRole("button", { name: "Ask Den" })).toBeNull();
  });

  it("opens the newest chat in a panel, once, and keeps it when closed and reopened", async () => {
    const fetch = vi.fn(async () => ok(STATE));
    vi.stubGlobal("fetch", fetch);
    const before = window.location.href;
    render(<AskFab plusOnSale />);
    // Nothing is loaded until the player opens it.
    expect(fetch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Ask Den" }));
    const dialog = await screen.findByRole("dialog", { name: "Ask Den" });
    await waitFor(() => expect(screen.getByRole("log")).toHaveTextContent("Where do I ward?"));
    expect(dialog).toHaveTextContent("4 questions left today");
    expect(screen.getByRole("button", { name: "Chats (1)" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open full page" })).toHaveAttribute(
      "href",
      "/ask?c=11111111-1111-4111-8111-111111111111",
    );
    // The page's address is left alone.
    expect(window.location.href).toBe(before);

    fireEvent.click(screen.getAllByRole("button", { name: "Close Ask Den" })[0]!);
    // Hidden, not unmounted: the chat is kept.
    expect(dialog).toHaveAttribute("data-state", "closed");
    fireEvent.click(screen.getByRole("button", { name: "Ask Den" }));
    expect(dialog).toHaveAttribute("data-state", "open");
    expect(screen.getByRole("log")).toHaveTextContent("Where do I ward?");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("says so when the chats can't load, and tries again", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(
        ok({ ...STATE, conversations: [], conversationId: null, messages: [] }),
      );
    vi.stubGlobal("fetch", fetch);
    render(<AskFab plusOnSale={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Ask Den" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't open Ask Den.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Try asking")).toBeInTheDocument();
    // No chats yet: nothing to list.
    expect(screen.queryByRole("button", { name: /^Chats/ })).toBeNull();
    expect(screen.getByRole("link", { name: "Open full page" })).toHaveAttribute("href", "/ask");
  });
});
