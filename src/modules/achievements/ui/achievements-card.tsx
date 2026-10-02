import { Award } from "lucide-react";
import { cn } from "cn";
import { describe, type Achievement } from "../domain/achievements";

/** Achievements with their tiers, current value and progress to the next tier. */
export function AchievementsCard({ items }: { items: Achievement[] }) {
  const earned = items.reduce((n, a) => n + a.tier, 0);
  const total = items.reduce((n, a) => n + a.tiers.length, 0);
  return (
    <section className="panel space-y-4 p-5" aria-labelledby="achievements-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="kicker">Milestones</p>
          <h2 id="achievements-title" className="text-lg font-semibold">
            Achievements
          </h2>
        </div>
        <p className="text-sm text-muted-foreground tabular-nums">
          {earned} of {total} tiers
        </p>
      </div>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((a) => {
          const top = a.tier > 0 ? a.tiers[a.tier - 1] : null;
          const prev = top ?? 0;
          const pct =
            a.next === null ? 100 : Math.min(100, ((a.value - prev) / (a.next - prev)) * 100);
          return (
            <li
              key={a.id}
              className={cn(
                "space-y-2 rounded-lg border p-3",
                a.tier > 0 ? "border-gold/25 bg-gold/[0.04]" : "border-white/[0.06]",
              )}
              aria-label={`${a.title}: ${a.tier} of ${a.tiers.length} tiers`}
            >
              <div className="flex items-start gap-2">
                <Award
                  aria-hidden
                  className={cn(
                    "mt-0.5 size-4 shrink-0",
                    a.tier > 0 ? "text-gold" : "text-muted-foreground/50",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{a.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {top !== null ? describe(a, top) : describe(a, a.tiers[0])}
                  </p>
                </div>
                <span aria-hidden className="flex gap-0.5 pt-1">
                  {a.tiers.map((t, i) => (
                    <span
                      key={t}
                      className={cn(
                        "size-1.5 rounded-full",
                        i < a.tier ? "bg-gold" : "bg-white/15",
                      )}
                    />
                  ))}
                </span>
              </div>
              <div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <span
                    className="block h-full rounded-full bg-gold/70"
                    style={{ width: `${Math.max(pct, a.value > prev ? 3 : 0)}%` }}
                  />
                </div>
                <p className="mt-1 text-[0.7rem] text-muted-foreground tabular-nums">
                  {a.next === null
                    ? `${a.value.toLocaleString("en-US")}: all tiers done`
                    : `${a.value.toLocaleString("en-US")} / ${a.next.toLocaleString("en-US")} for the next tier`}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
