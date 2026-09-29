import { Info } from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import type { MatchSummary, WinRecord } from "../domain/match-summary";
import { MIN_SAMPLE } from "../domain/match-summary";
import { formatPercent } from "./format";
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
      <div className="text-right sm:w-36">
        <div className="text-base font-semibold tabular-nums">{formatPercent(record.winRate)}</div>
        <div className="text-[0.7rem] text-muted-foreground tabular-nums">
          {record.wins}W · {record.losses}L · n={record.games}
          {record.games > 0 && record.lowSample && (
            <Badge variant="outline" className="ml-1.5 h-4 px-1 text-[0.6rem]">
              low sample
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
          {classified} of {overall.games} classified
        </span>
      </div>

      <div className="divide-y divide-white/[0.06]">
        <Row label="Solo" record={byQueue.solo} hint="Queued alone" />
        <Row label="Party" record={byQueue.party} hint="Queued with friends" />
        <Row label="Unknown" record={byQueue.unknown} hint="No usable party size" />
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
              <span className="text-muted-foreground">Party of {p.partySize}</span>{" "}
              <span className="font-semibold tabular-nums">{formatPercent(p.winRate)}</span>{" "}
              <span className="text-muted-foreground tabular-nums">n={p.games}</span>
              {p.lowSample && <span className="text-muted-foreground"> · low sample</span>}
            </span>
          ))}
        </div>
      )}

      <p className="mt-4 flex gap-2 text-xs text-muted-foreground">
        <Info aria-hidden className="mt-px size-3.5 shrink-0" />
        <span>
          Queue type comes from OpenDota&apos;s reported party size. Missing values are counted as
          unknown, never as solo. Rates under {MIN_SAMPLE} games are marked low sample; the tick
          marks 50%.
        </span>
      </p>
    </section>
  );
}
