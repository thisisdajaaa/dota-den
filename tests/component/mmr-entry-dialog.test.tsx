import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MmrEntryDialog } from "@/modules/mmr/ui/mmr-entry-dialog";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("MmrEntryDialog", () => {
  afterEach(() => vi.useRealTimers());

  it("defaults to the time you open it, not when the page loaded", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 1, 18, 0));
    render(<MmrEntryDialog />);
    // Three hours of games later, in the same tab.
    vi.setSystemTime(new Date(2026, 9, 1, 21, 5));
    fireEvent.click(screen.getByRole("button", { name: "Log MMR" }));
    expect(screen.getByLabelText(/When you saw it/)).toHaveValue("2026-10-01T21:05");
  });

  it("reads the MMR from a screenshot into the box, for you to check before saving", async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        success: true,
        message: "OK",
        statusCode: 200,
        data: { mmr: 5420, seen: "next to the medal" },
      }),
    );
    vi.stubGlobal("fetch", fetch);
    render(<MmrEntryDialog canReadScreenshots />);
    fireEvent.click(screen.getByRole("button", { name: "Log MMR" }));
    const file = new File(["png"], "shot.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Screenshot of your MMR"), {
      target: { files: [file] },
    });
    await waitFor(() => expect(screen.getByLabelText("MMR")).toHaveValue("5420"));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Read 5,420 (next to the medal). Check it before saving.",
    );
    // Only the read happened: nothing was saved.
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((fetch.mock.calls[0] as unknown as [string])[0]).toBe(
      "/api/v1/mmr-entries/read-screenshot",
    );
    vi.unstubAllGlobals();
  });

  it("says so when no MMR is found, and hides the option without the AI provider", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          success: true,
          message: "OK",
          statusCode: 200,
          data: { mmr: null, seen: null },
        }),
      ),
    );
    const { unmount } = render(<MmrEntryDialog canReadScreenshots />);
    fireEvent.click(screen.getByRole("button", { name: "Log MMR" }));
    fireEvent.change(screen.getByLabelText("Screenshot of your MMR"), {
      target: { files: [new File(["x"], "x.png", { type: "image/png" })] },
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Couldn't find your MMR");
    expect(screen.getByLabelText("MMR")).toHaveValue("");
    vi.unstubAllGlobals();
    unmount();

    render(<MmrEntryDialog />);
    fireEvent.click(screen.getByRole("button", { name: "Log MMR" }));
    expect(screen.queryByRole("button", { name: "Read from screenshot" })).toBeNull();
  });
});
