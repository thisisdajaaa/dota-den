import Link from "next/link";
import { cn } from "cn";
import { getT } from "@/common/i18n/server";
import type { Calendar } from "../domain/calendar";
import { addDays, weekday, type DayKey } from "@/common/time/day-key";
import { basisOf, dayStyle, deltaLabel, periodScale } from "./day-tone";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** GitHub-style year heatmap: one column per week, one square per day. */
export async function YearHeatmap({
  from,
  to,
  calendar,
  today,
  hrefForDay,
  title,
}: {
  from: DayKey;
  to: DayKey;
  calendar: Calendar;
  today: DayKey;
  hrefForDay: (key: DayKey) => string;
  title?: string;
}) {
  const t = await getT();
  const scale = periodScale(calendar.days.values());
  const start = addDays(from, -weekday(from));
  const weeks: DayKey[][] = [];
  for (let k = start; k <= to; k = addDays(k, 7))
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(k, i)));

  return (
    <div className="space-y-2">
      {title && <h3 className="text-sm font-semibold">{title}</h3>}
      <div className="overflow-x-auto pb-1">
        <div className="inline-flex flex-col gap-1">
          <div className="flex gap-[3px] pl-0 text-[0.6rem] text-muted-foreground" aria-hidden>
            {weeks.map((w, i) => {
              // Label the column where a month starts (or the first column).
              const start = w.find((k) => k >= from && k <= to && (k.endsWith("-01") || i === 0));
              return (
                <span key={i} className="w-3 shrink-0 overflow-visible whitespace-nowrap">
                  {start ? MONTHS[Number(start.slice(5, 7)) - 1] : ""}
                </span>
              );
            })}
          </div>
          <div className="flex gap-[3px]">
            {weeks.map((w, i) => (
              <div key={i} className="flex flex-col gap-[3px]">
                {w.map((key) => {
                  if (key < from || key > to)
                    return <span key={key} className="size-3" aria-hidden />;
                  const day = calendar.days.get(key);
                  const basis = basisOf(day);
                  const label = deltaLabel(day);
                  const value = label
                    ? t(
                        basis === "estimate" ? "mmr.calendar.valueEstimate" : "mmr.calendar.value",
                        { value: label },
                      )
                    : t("mmr.calendar.noRanked");
                  const record = day?.games
                    ? `, ${t("mmr.calendar.wl", { wins: day.wins, losses: day.losses })}`
                    : "";
                  const text = `${key}: ${value}${record}`;
                  return (
                    <Link
                      key={key}
                      href={hrefForDay(key)}
                      scroll={false}
                      title={text}
                      aria-label={text}
                      style={dayStyle(day, scale)}
                      className={cn(
                        "size-3 rounded-[3px] border transition-transform hover:scale-125",
                        basis === "actual"
                          ? "border-foreground/40"
                          : basis === "estimate"
                            ? "border-dashed border-foreground/25"
                            : "border-transparent bg-white/[0.04]",
                        key > today && "opacity-30",
                      )}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
