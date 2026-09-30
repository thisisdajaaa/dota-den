import { fireEvent, render, screen } from "@testing-library/react";
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
});
