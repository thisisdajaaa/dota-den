import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SyncControl } from "@/modules/matches/ui/sync-control";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

// The ServiceResponse envelope every API route returns.
const envelope = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify({ statusCode: status, ...body }), { status });

const props = {
  stale: true,
  backfillComplete: true,
  backfillCooldownMs: 30_000,
  recheckMs: 300_000,
  awaitingHistory: false,
  lastSyncedLabel: "2m ago",
};

function renderControl(overrides: Partial<typeof props> = {}) {
  return render(
    <TooltipProvider>
      <SyncControl {...props} {...overrides} />
    </TooltipProvider>,
  );
}

describe("SyncControl", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads the summary from the envelope: a finished history stays idle", async () => {
    const fetch = vi.fn(async () =>
      envelope(200, {
        success: true,
        message: "Matches synced",
        data: { fetched: 3, inserted: 0, backfillComplete: true },
      }),
    );
    vi.stubGlobal("fetch", fetch);
    renderControl();
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(screen.getByRole("status")).toHaveTextContent("Synced 2m ago");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("treats the cooldown reply as 'synced recently', not as a paused sync", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        envelope(429, {
          success: false,
          message: "Matches were synced recently.",
          data: null,
          code: "rate_limited",
          details: { retryAt: new Date(Date.now() + 240_000).toISOString() },
        }),
      ),
    );
    renderControl({ stale: false });
    fireEvent.click(screen.getByRole("button", { name: "Sync now" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Synced 2m ago"));
    expect(screen.getByRole("status")).not.toHaveTextContent("Sync paused");
  });

  it("refreshes once another tab's sync is done, after being told one is running", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      refresh.mockClear();
      const replies = [
        envelope(409, {
          success: false,
          message: "A sync is already running for this account.",
          data: null,
          code: "conflict",
        }),
        envelope(429, {
          success: false,
          message: "Matches were synced recently.",
          data: null,
          code: "rate_limited",
          details: { retryAt: new Date(Date.now() + 240_000).toISOString() },
        }),
      ];
      const fetch = vi.fn(async () => replies.shift()!);
      vi.stubGlobal("fetch", fetch);
      renderControl();
      await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
      expect(refresh).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(5_000);
      await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    } finally {
      vi.useRealTimers();
    }
  });
});
