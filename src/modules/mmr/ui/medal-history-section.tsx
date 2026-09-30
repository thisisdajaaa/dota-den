import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "cn";
import { parseRankTier } from "@/modules/matches/domain/rank-tier";
import { RankMedal, rankLabel } from "@/modules/matches/ui/rank-medal";
import { medalChanges, type MedalSnapshot } from "../domain/medal-history";

const label = (tier: number) => {
  const r = parseRankTier(tier);
  return r ? rankLabel(r) : `Rank ${tier}`;
};

/** Every medal change we've seen, newest first. Needs no typing from the player. */
export function MedalHistorySection({
  history,
  timeZone,
}: {
  history: MedalSnapshot[];
  timeZone: string;
}) {
  const day = new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric" });
  const full = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const current = history.at(-1);
  const currentRank = current ? parseRankTier(current.rankTier) : null;
  const changes = medalChanges(history);

  return (
    <section className="panel space-y-4 p-5" aria-labelledby="medal-history-title">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="kicker">Medal history</p>
          <h2 id="medal-history-title" className="text-lg font-semibold">
            {currentRank ? rankLabel(currentRank) : "Your medal"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {current
              ? `Tracked automatically since ${full.format(history[0].observedAt)}: we check your medal when you open your overview, and daily. Valve shares medals, not MMR.`
              : "We'll note every medal change from now on: we check it when you open your overview, and daily. Valve shares medals, not MMR."}
          </p>
        </div>
        {currentRank && <RankMedal rank={currentRank} size={56} />}
      </div>

      {current &&
        (changes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No medal changes yet.</p>
        ) : (
          <ul className="divide-y divide-white/[0.05] overflow-hidden rounded-lg border border-white/[0.06]">
            {changes.map((c) => {
              const up = c.direction === "up";
              const Icon = up ? TrendingUp : TrendingDown;
              const sameDay = day.format(c.lastSeenBefore) === day.format(c.at);
              return (
                <li
                  key={c.at.toISOString()}
                  className="flex items-center gap-3 px-3 py-2.5 text-sm"
                >
                  <Icon
                    aria-hidden
                    className={cn("size-4 shrink-0", up ? "text-win" : "text-loss")}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="sr-only">{up ? "Ranked up: " : "Ranked down: "}</span>
                    {label(c.from)} → <span className="font-medium">{label(c.to)}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {sameDay
                      ? day.format(c.at)
                      : `between ${day.format(c.lastSeenBefore)} and ${day.format(c.at)}`}
                  </span>
                </li>
              );
            })}
          </ul>
        ))}
    </section>
  );
}
