"use client";

import * as React from "react";
import { cn } from "cn";
import { CalendarIcon } from "lucide-react";
import { useLocale, useT } from "@/common/i18n/client";
import { LOCALE_TAGS } from "@/common/i18n/locales";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" → local midnight, or undefined for anything else. */
export function parseDateKey(key: string | undefined | null): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key ?? "");
  if (!m) return undefined;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** A local date as "YYYY-MM-DD". */
export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function useDateLabel() {
  const tag = LOCALE_TAGS[useLocale()];
  return React.useMemo(() => {
    const f = new Intl.DateTimeFormat(tag, { dateStyle: "medium" });
    return (d: Date) => f.format(d);
  }, [tag]);
}

type DatePickerProps = {
  /** "YYYY-MM-DD" (controlled). */
  value?: string;
  /** "YYYY-MM-DD" (uncontrolled). */
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Also renders a hidden input with this name, so plain (GET/POST) forms submit the value. */
  name?: string;
  /** Earliest and latest pickable days, "YYYY-MM-DD". */
  min?: string;
  max?: string;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
};

/**
 * A button that opens a calendar. Keyboard: Enter/Space opens it, the arrow keys move by day
 * and week, Page Up/Down by month, Home/End to the week's ends, Escape closes.
 */
function DatePicker({
  value,
  defaultValue,
  onValueChange,
  name,
  min,
  max,
  id,
  placeholder,
  disabled,
  required,
  className,
  "aria-labelledby": labelledBy,
  ...aria
}: DatePickerProps) {
  const t = useT();
  const label = useDateLabel();
  const [open, setOpen] = React.useState(false);
  const [inner, setInner] = React.useState(defaultValue ?? "");
  const current = value ?? inner;
  const selected = parseDateKey(current);
  const minDate = parseDateKey(min);
  const maxDate = parseDateKey(max);
  const autoId = React.useId();
  const buttonId = id ?? `${autoId}-date`;
  const valueId = `${autoId}-value`;

  function pick(d: Date | undefined) {
    if (!d) return; // Clicking the selected day again keeps it (no empty value).
    const key = toDateKey(d);
    if (value === undefined) setInner(key);
    onValueChange?.(key);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={buttonId}
          type="button"
          variant="outline"
          disabled={disabled}
          aria-labelledby={labelledBy ? `${labelledBy} ${valueId}` : undefined}
          data-empty={!selected || undefined}
          className={cn(
            "h-10 w-full min-w-40 justify-start gap-2 px-3 font-normal tabular-nums sm:h-8 sm:px-2.5",
            "aria-invalid:border-destructive data-empty:text-muted-foreground",
            className,
          )}
          {...aria}
        >
          <CalendarIcon aria-hidden className="text-gold" />
          <span id={valueId}>
            {selected ? label(selected) : (placeholder ?? t("common.datePicker.pick"))}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-3"
        align="start"
        // Focus goes to the selected day (DayPicker autoFocus), not the "previous month" button.
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Calendar
          mode="single"
          autoFocus
          required={required}
          selected={selected}
          onSelect={pick}
          defaultMonth={selected ?? maxDate}
          captionLayout="dropdown"
          startMonth={minDate ?? new Date(2011, 0)}
          endMonth={maxDate ?? new Date(new Date().getFullYear() + 1, 11)}
          disabled={[
            ...(minDate ? [{ before: minDate }] : []),
            ...(maxDate ? [{ after: maxDate }] : []),
          ]}
        />
      </PopoverContent>
      {name && <input type="hidden" name={name} value={current} />}
    </Popover>
  );
}

type DateTimePickerProps = Omit<DatePickerProps, "min" | "max" | "name"> & {
  /** "YYYY-MM-DDTHH:mm" in local time, the same format as datetime-local inputs. */
  value?: string;
  defaultValue?: string;
  /** Earliest and latest allowed moments. */
  min?: Date;
  max?: Date;
  name?: string;
  /** Accessible name of the time box (defaults to "Time"). */
  timeLabel?: string;
};

/** A date picker plus a time box, for one local "YYYY-MM-DDTHH:mm" value. */
function DateTimePicker({
  value,
  defaultValue,
  onValueChange,
  min,
  max,
  name,
  timeLabel,
  className,
  disabled,
  id,
  "aria-invalid": invalid,
  "aria-describedby": describedBy,
  ...rest
}: DateTimePickerProps) {
  const t = useT();
  const [inner, setInner] = React.useState(defaultValue ?? "");
  const current = value ?? inner;
  const [datePart = "", timePart = ""] = current.split("T");

  function emit(date: string, time: string) {
    const next = date ? `${date}T${time || "00:00"}` : "";
    if (value === undefined) setInner(next);
    onValueChange?.(next);
  }

  const sameDay = (d?: Date) => (d ? toDateKey(d) === datePart : false);
  const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

  return (
    <div className={cn("flex w-full gap-2", className)}>
      <DatePicker
        {...rest}
        id={id}
        disabled={disabled}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className="flex-1"
        value={datePart}
        min={min ? toDateKey(min) : undefined}
        max={max ? toDateKey(max) : undefined}
        onValueChange={(d) => emit(d, timePart)}
      />
      <Input
        type="time"
        aria-label={timeLabel ?? t("common.datePicker.time")}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        disabled={disabled}
        value={timePart}
        min={min && sameDay(min) ? hm(min) : undefined}
        max={max && sameDay(max) ? hm(max) : undefined}
        onChange={(e) => emit(datePart, e.target.value)}
        className="h-10 w-32 shrink-0 tabular-nums sm:h-8 dark:scheme-dark"
      />
      {name && <input type="hidden" name={name} value={current} />}
    </div>
  );
}

export { DatePicker, DateTimePicker };
