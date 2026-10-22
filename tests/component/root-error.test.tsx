import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import RootError from "@/app/error";

describe("root error page", () => {
  it("explains, reports the error, and offers a retry and a way home", async () => {
    const report = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null));
    const retry = vi.fn();
    render(<RootError error={new Error("db down")} retry={retry} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
    expect(screen.getByRole("link", { name: "Go home" })).toHaveAttribute("href", "/");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledWith("/api/v1/errors", expect.anything());
    report.mockRestore();
  });
});
