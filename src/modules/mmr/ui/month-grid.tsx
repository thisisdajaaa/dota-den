import Link from "next/link";
import { cn } from "cn";
import type { Calendar } from "../domain/calendar";
import { addDays, weekday, type DayKey } from "@/common/time/day-key";
import { basisOf, dayStyle, deltaLabel, periodScale } from "./day-tone";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function MonthGrid({
  from,
  to,
  calendar,
  today,
  selected,
  hrefForDay,
}: {
  from: DayKey;
  to: DayKey;
  calendar: Calendar;
  today: DayKey;
  selected: DayKey | null;
  hrefForDay: (key: DayKey) => string;
}) {
  const scale = periodScale(calendar.days.values());
  const start = addDays(from, -weekday(from));
  const cells: Array<DayKey | null> = [];
  for (let k = start; k <= to || cells.length % 7 !== 0; k = addDays(k, 1))
    cells.push(k < from || k > to ? null : k);

  return (
    <div role="grid" aria-label="Month calendar" className="space-y-1.5">
      <div role="row" className="grid grid-cols-7 gap-1.5">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            role="columnheader"
            className="px-1 text-[0.65rem] font-medium tracking-wider text-muted-foreground uppercase"
          >
            {d}
          </div>
        ))}
      </div>
      {Array.from({ length: cells.length / 7 }, (_, row) => (
        <div role="row" key={row} className="grid grid-cols-7 gap-1.5">
          {cells.slice(row * 7, row * 7 + 7).map((key, i) => {
            if (!key) return <div key={`pad-${row}-${i}`} role="gridcell" aria-hidden />;
            const day = calendar.days.get(key);
            const basis = basisOf(day);
            const label = deltaLabel(day);
            const future = key > today;
            const isSelected = key === selected;
            const describe = [
              key,
              label
                ? `${basis === "estimate" ? "estimated " : ""}${label.replace("≈ ", "")} MMR`
                : "no ranked games",
              day?.games ? `${day.games} ranked game${day.games === 1 ? "" : "s"}` : null,
            ]
              .filter(Boolean)
              .join(", ");
            return (
              <Link
                key={key}
                role="gridcell"
                href={hrefForDay(key)}
                scroll={false}
                aria-label={describe}
                aria-current={isSelected ? "date" : undefined}
                style={dayStyle(day, scale)}
                className={cn(
                  "group relative flex min-h-16 flex-col justify-between rounded-lg border p-1.5 text-left transition-[transform,border-color] hover:-translate-y-0.5 sm:min-h-24 sm:p-2.5",
                  basis === "actual"
                    ? "border-foreground/25"
                    : basis === "estimate"
                      ? "border-dashed border-foreground/20"
                      : "border-white/[0.05] bg-white/[0.015]",
                  isSelected && "ring-2 ring-gold",
                  future && "opacity-40",
                )}
              >
                <span
                  className={cn(
                    "text-xs tabular-nums",
                    key === today ? "font-bold text-gold" : "text-muted-foreground",
                  )}
                >
                  {Number(key.slice(8))}
                </span>
                {label && (
                  <span
                    className={cn(
                      "text-xs font-semibold tabular-nums sm:text-base",
                      basis === "estimate" && "font-medium text-foreground/80",
                    )}
                  >
                    {/* On phones the dashed border alone marks an estimate. */}
                    {label.startsWith("≈ ") ? (
                      <>
                        <span className="hidden sm:inline">≈ </span>
                        {label.slice(2)}
                      </>
                    ) : (
                      label
                    )}
                  </span>
                )}
                {day && day.games > 0 && (
                  <span className="hidden text-[0.65rem] text-muted-foreground sm:block">
                    {day.wins}W {day.losses}L
                  </span>
                )}
                {day && day.observations.length > 0 && (
                  <span
                    aria-hidden
                    className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-gold"
                    title="MMR logged this day"
                  />
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </div>
  );
}
