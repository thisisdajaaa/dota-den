import Link from "next/link";
import { cn } from "cn";
import type { Calendar } from "../domain/calendar";
import { daysBetween, type DayKey } from "@/common/time/day-key";
import { basisOf, dayStyle, deltaLabel, periodScale } from "./day-tone";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function WeekView({
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
  return (
    <ol className="grid grid-cols-1 gap-2 sm:grid-cols-7">
      {daysBetween(from, to).map((key, i) => {
        const day = calendar.days.get(key);
        const basis = basisOf(day);
        const label = deltaLabel(day);
        return (
          <li key={key}>
            <Link
              href={hrefForDay(key)}
              scroll={false}
              style={dayStyle(day, scale)}
              aria-current={key === selected ? "date" : undefined}
              className={cn(
                "flex h-full flex-row items-center justify-between gap-2 rounded-xl border p-3 transition-transform hover:-translate-y-0.5 sm:min-h-36 sm:flex-col sm:items-start",
                basis === "actual"
                  ? "border-foreground/25"
                  : basis === "estimate"
                    ? "border-dashed border-foreground/20"
                    : "border-white/[0.05] bg-white/[0.015]",
                key === selected && "ring-2 ring-gold",
                key > today && "opacity-40",
              )}
            >
              <span>
                <span className="block text-xs text-muted-foreground">{WEEKDAYS[i]}</span>
                <span className={cn("text-lg font-semibold", key === today && "text-gold")}>
                  {Number(key.slice(8))}
                </span>
              </span>
              <span className="text-right sm:text-left">
                <span className="block text-lg font-semibold tabular-nums">{label ?? "—"}</span>
                <span className="block text-xs text-muted-foreground">
                  {day?.games ? `${day.wins} wins · ${day.losses} losses` : "No ranked games"}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
