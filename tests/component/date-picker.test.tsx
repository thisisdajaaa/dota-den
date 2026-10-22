import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/common/i18n/client";
import { englishMessages, MESSAGES } from "@/common/i18n/messages";
import { DatePicker, DateTimePicker } from "@/components/ui/date-picker";

function Labelled({ children }: { children: React.ReactNode }) {
  return (
    <form aria-label="Range">
      <label id="from-label" htmlFor="from">
        From
      </label>
      {children}
    </form>
  );
}

describe("DatePicker", () => {
  it("opens a calendar, picks a day and submits it as YYYY-MM-DD", () => {
    const onChange = vi.fn();
    const { container } = render(
      <Labelled>
        <DatePicker
          id="from"
          name="from"
          aria-labelledby="from-label"
          defaultValue="2026-10-10"
          min="2026-10-05"
          max="2026-10-20"
          onValueChange={onChange}
        />
      </Labelled>,
    );
    const trigger = screen.getByRole("button", { name: "From Oct 10, 2026" });
    expect(container.querySelector('input[name="from"]')).toHaveValue("2026-10-10");

    fireEvent.click(trigger);
    const grid = screen.getByRole("grid", { name: "October 2026" });
    expect(grid).toBeInTheDocument();
    // Outside the allowed range: not pickable.
    expect(screen.getByRole("button", { name: /October 21, 2026/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /October 4, 2026/ })).toBeDisabled();
    // The current value is marked selected.
    expect(screen.getByRole("button", { name: /October 10, 2026, selected/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /October 15, 2026/ }));
    expect(onChange).toHaveBeenCalledWith("2026-10-15");
    expect(screen.queryByRole("grid")).toBeNull();
    expect(container.querySelector('input[name="from"]')).toHaveValue("2026-10-15");
    expect(screen.getByRole("button", { name: "From Oct 15, 2026" })).toBeInTheDocument();
  });

  it("names months and days in the viewer's language", () => {
    render(
      <I18nProvider locale="fil" messages={MESSAGES.fil} fallback={englishMessages}>
        <DatePicker defaultValue="2026-10-22" />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Okt/ }));
    expect(screen.getByRole("grid", { name: "Oktubre 2026" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Huwebes, Oktubre 22, 2026/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Susunod na buwan" })).toBeInTheDocument();
  });
});

describe("DateTimePicker", () => {
  it("keeps the datetime-local format: picking a day keeps the time, and vice versa", () => {
    const onChange = vi.fn();
    render(
      <Labelled>
        <DateTimePicker
          id="from"
          aria-labelledby="from-label"
          value="2026-10-10T21:05"
          max={new Date(2026, 9, 22, 12, 0)}
          onValueChange={onChange}
        />
      </Labelled>,
    );
    fireEvent.click(screen.getByRole("button", { name: "From Oct 10, 2026" }));
    expect(screen.getByRole("button", { name: /October 23, 2026/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /October 12, 2026/ }));
    expect(onChange).toHaveBeenLastCalledWith("2026-10-12T21:05");

    fireEvent.change(screen.getByLabelText("Time"), { target: { value: "08:30" } });
    expect(onChange).toHaveBeenLastCalledWith("2026-10-10T08:30");
  });
});
