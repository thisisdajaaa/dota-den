"use client";

import { useId, useState } from "react";
import { addDays, type DayKey } from "@/common/time/day-key";
import { DatePicker } from "@/components/ui/date-picker";

const earliest = (a: DayKey, b: DayKey) => (a < b ? a : b);
const latest = (a: DayKey, b: DayKey) => (a > b ? a : b);

/**
 * The custom range's From and To pickers. They submit `from` and `to` as YYYY-MM-DD with
 * the surrounding GET form, and keep the range valid: From ≤ To, at most `maxRangeDays`
 * long, starting at most `maxLookbackDays` back and ending by `today`.
 */
export function ReportRangeFields({
  from: initialFrom,
  to: initialTo,
  today,
  maxRangeDays,
  maxLookbackDays,
  labels,
}: {
  from: DayKey;
  to: DayKey;
  today: DayKey;
  maxRangeDays: number;
  maxLookbackDays: number;
  labels: { from: string; to: string };
}) {
  const id = useId();
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const floor = addDays(today, -maxLookbackDays);
  const span = maxRangeDays - 1;

  const field = (
    key: "from" | "to",
    value: DayKey,
    onChange: (v: DayKey) => void,
    min: DayKey,
    max: DayKey,
  ) => (
    <div className="grid gap-1">
      <label
        id={`${id}-${key}-label`}
        htmlFor={`${id}-${key}`}
        className="text-xs text-muted-foreground"
      >
        {labels[key]}
      </label>
      <DatePicker
        id={`${id}-${key}`}
        name={key}
        required
        value={value}
        onValueChange={onChange}
        min={min}
        max={max}
        aria-labelledby={`${id}-${key}-label`}
        className="sm:w-40"
      />
    </div>
  );

  return (
    <>
      {field("from", from, setFrom, latest(floor, addDays(to, -span)), to)}
      {field("to", to, setTo, from, earliest(today, addDays(from, span)))}
    </>
  );
}
