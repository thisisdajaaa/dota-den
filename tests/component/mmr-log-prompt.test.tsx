import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MmrLogPrompt } from "@/modules/mmr/ui/mmr-log-prompt";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

const props = { gamesSince: 1, newestGameId: "m1", lastMmr: 5_420, exactIfLoggedNow: true };

describe("MmrLogPrompt", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it("explains why logging now makes the change exact", () => {
    render(<MmrLogPrompt {...props} />);
    expect(screen.getByRole("region", { name: "Log your MMR" })).toHaveTextContent(
      "You played 1 ranked game since you logged 5,420. Log your MMR now and that game's change will be exact.",
    );
  });

  it("says several games give a total, not per-game changes", () => {
    render(<MmrLogPrompt {...props} gamesSince={3} exactIfLoggedNow={false} />);
    expect(screen.getByRole("region")).toHaveTextContent(
      "Logging now gives the total change for those games",
    );
  });

  it("saves an entry with the current time and refreshes", async () => {
    const fetch = vi.fn(async () => new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetch);
    render(<MmrLogPrompt {...props} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Your MMR now" }), {
      target: { value: "5450" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log it" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/v1/mmr-entries");
    expect(JSON.parse(String(init.body))).toMatchObject({ mmr: "5450", note: null });
  });

  it("shows the API's validation message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              // The ServiceResponse envelope: details are the flattened zod errors.
              success: false,
              message: "Check the highlighted fields",
              data: null,
              statusCode: 400,
              code: "bad_request",
              details: { formErrors: [], fieldErrors: { mmr: ["MMR can't be above 15,000"] } },
            }),
            { status: 400 },
          ),
      ),
    );
    render(<MmrLogPrompt {...props} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Your MMR now" }), {
      target: { value: "99999" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log it" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("MMR can't be above 15,000");
  });

  it("stays dismissed until the next ranked game", () => {
    const { rerender } = render(<MmrLogPrompt {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.queryByRole("region")).toBeNull();
    rerender(<MmrLogPrompt {...props} newestGameId="m2" gamesSince={2} exactIfLoggedNow={false} />);
    expect(screen.getByRole("region", { name: "Log your MMR" })).toBeInTheDocument();
  });
});
