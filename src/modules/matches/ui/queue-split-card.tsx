import { Info } from "lucide-react";
import { cn } from "cn";
import { getT } from "@/common/i18n/server";
import { plural } from "@/common/i18n/translate";
import { Badge } from "@/components/ui/badge";
import type { MatchSummary, WinRecord } from "../domain/match-summary";
import { MIN_SAMPLE } from "../domain/match-summary";
import { formatPercent, partyName } from "./format";
import { WinRateBar } from "./win-rate-bar";

async function Row({ label, record, hint }: { label: string; record: WinRecord; hint?: string }) {
  const t = await getT();
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
          {t("matches.queueSplit.record", { wins: record.wins, losses: record.losses })}
          {record.games > 0 && record.lowSample && (
            <Badge variant="outline" className="ml-1.5 h-4 px-1 text-[0.6rem]">
              {t("matches.queueSplit.fewGames")}
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

export async function QueueSplitCard({ summary }: { summary: MatchSummary }) {
  const t = await getT();
  const { byQueue, byPartySize, overall } = summary;
  const classified = byQueue.solo.games + byQueue.party.games;
  return (
    <section className="panel p-5" aria-labelledby="queue-split">
      <div className="mb-2 flex items-baseline justify-between gap-4">
        <div>
          <p className="kicker">{t("matches.queueSplit.kicker")}</p>
          <h2 id="queue-split" className="text-lg font-semibold">
            {t("matches.queueSplit.title")}
          </h2>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {t("matches.queueSplit.known", { known: classified, total: overall.games })}
        </span>
      </div>

      <div className="divide-y divide-white/[0.06]">
        <Row
          label={t("matches.queue.solo")}
          record={byQueue.solo}
          hint={t("matches.queueSplit.soloHint")}
        />
        <Row
          label={t("matches.queue.party")}
          record={byQueue.party}
          hint={t("matches.queueSplit.partyHint")}
        />
        <Row
          label={t("matches.queue.unknown")}
          record={byQueue.unknown}
          hint={t("matches.queueSplit.unknownHint")}
        />
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
                · {plural(t, "matches.queueSplit.games", p.games)}
                {p.lowSample && t("matches.queueSplit.tooFew")}
              </span>
            </span>
          ))}
        </div>
      )}

      <p className="mt-4 flex gap-2 text-xs text-muted-foreground">
        <Info aria-hidden className="mt-px size-3.5 shrink-0" />
        <span>{t("matches.queueSplit.note", { min: MIN_SAMPLE })}</span>
      </p>
    </section>
  );
}
