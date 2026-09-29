import { Info } from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import type { MatchSummary, WinRecord } from "../domain/match-summary";
import { MIN_SAMPLE } from "../domain/match-summary";
import { formatPercent, partyName, plural } from "./format";
import { WinRateBar } from "./win-rate-bar";

function Row({ label, record, hint }: { label: string; record: WinRecord; hint?: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 py-2.5 sm:grid-cols-[8rem_1fr_auto]">
      <div>
        <div className="font-medium">{label}</div>
        {hint && (
          <div className="text-[0.7rem] whitespace-nowrap text-muted-foreground">{hint}</div>
        )}
      </div>
      <WinRateBar
        rate={record.winRate}
        muted={record.lowSample}
        className="order-last col-span-2 sm:order-none sm:col-span-1"
      />
      <div className="text-right sm:w-40">
        <div className="text-base font-semibold tabular-nums">{formatPercent(record.winRate)}</div>
        <div className="text-[0.7rem] whitespace-nowrap text-muted-foreground tabular-nums">
          {record.wins} wins · {record.losses} losses
          {record.games > 0 && record.lowSample && (
            <Badge variant="outline" className="ml-1.5 h-4 px-1 text-[0.6rem]">
              few games
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

export function QueueSplitCard({ summary }: { summary: MatchSummary }) {
  const { byQueue, byPartySize, overall } = summary;
  const classified = byQueue.solo.games + byQueue.party.games;
  return (
    <section className="panel p-5" aria-labelledby="queue-split">
      <div className="mb-2 flex items-baseline justify-between gap-4">
        <div>
          <p className="kicker">Solo vs party</p>
          <h2 id="queue-split" className="text-lg font-semibold">
            Win rate by queue
          </h2>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          Queue known for {classified} of {overall.games} games
        </span>
      </div>

      <div className="divide-y divide-white/[0.06]">
        <Row label="Solo" record={byQueue.solo} hint="You queued alone" />
        <Row label="Party" record={byQueue.party} hint="You queued with friends" />
        <Row label="Unknown" record={byQueue.unknown} hint="Dota didn't record it" />
      </div>

      {byPartySize.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {byPartySize.map((p) => (
            <span
              key={p.partySize}
              className={cn(
                "rounded-md border border-white/[0.07] bg-white/[0.03] px-2.5 py-1.5 text-xs",
                p.lowSample && "border-dashed opacity-70",
              )}
            >
              <span className="font-medium">{partyName(p.partySize)}</span>{" "}
              <span className="font-semibold tabular-nums">{formatPercent(p.winRate)}</span>{" "}
              <span className="text-muted-foreground tabular-nums">
                · {plural(p.games, "game")}
                {p.lowSample && ", too few to judge"}
              </span>
            </span>
          ))}
        </div>
      )}

      <p className="mt-4 flex gap-2 text-xs text-muted-foreground">
        <Info aria-hidden className="mt-px size-3.5 shrink-0" />
        <span>
          We only count a game as solo or party when Dota&apos;s match data says so. Games without
          that info go under Unknown and are never assumed to be solo. Win rates from fewer than{" "}
          {MIN_SAMPLE} games can swing a lot, so they&apos;re shown faded. The line in the middle of
          each bar marks 50%.
        </span>
      </p>
    </section>
  );
}
