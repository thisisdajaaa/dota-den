"use client";

import { Gauge, Info } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "cn";
import { encodeSnapshot, snapshotOf } from "../application/snapshot";
import type { DraftOutlook, OutlookHero, SideBreakdown } from "../domain/draft-outlook";
import type { DraftState, Side } from "../domain/draft-state";
import type { DraftHero } from "./types";

const pct = (n: number | null) => (n === null ? "—" : `${(n * 100).toFixed(1)}%`);
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n).toFixed(1)}`;
const sideName = (s: Side) => (s === "radiant" ? "Radiant" : "Dire");

/**
 * Which side the draft favours so far, with its evidence. Refetched whenever a pick lands
 * (bans don't change the lineups). Always labelled as an estimate.
 */
export function DraftOutlookPanel({
  state,
  heroes,
}: {
  state: DraftState;
  heroes: Map<number, DraftHero>;
}) {
  const picks = [...state.sides.radiant.picks, ...state.sides.dire.picks]
    .map((p) => p.heroId)
    .join(",");
  const [result, setResult] = useState<{ key: string; outlook: DraftOutlook | null } | null>(null);

  useEffect(() => {
    if (!picks) return;
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/v1/drafts/outlook", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ snapshot: encodeSnapshot(snapshotOf(state)) }),
          signal: controller.signal,
        });
        const outlook = res.ok ? ((await res.json()) as DraftOutlook) : null;
        setResult({ key: picks, outlook });
      } catch {
        if (!controller.signal.aborted) setResult({ key: picks, outlook: null });
      }
    })();
    return () => controller.abort();
    // Keyed on the picks; state is read at that point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picks]);

  const current = result?.key === picks ? result : null;
  const outlook = current?.outlook ?? null;

  return (
    <section className="panel p-4" aria-label="Draft outlook">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Gauge aria-hidden className="size-4 text-gold" /> Draft outlook
          <span className="rounded border border-white/15 px-1.5 text-[0.6rem] font-medium tracking-wider text-muted-foreground uppercase">
            Estimate
          </span>
        </h2>
        {outlook && (
          <span className="text-xs text-muted-foreground">
            {outlook.confidence === "medium" ? "Medium confidence" : "Low confidence"} ·{" "}
            {Math.round(outlook.coverage * 100)}% of matchups have enough games
          </span>
        )}
      </header>

      {!picks ? (
        <p className="text-sm text-muted-foreground">
          Once heroes are picked, this shows which side the draft favours and why.
        </p>
      ) : !current ? (
        <div className="space-y-3" aria-busy>
          <span className="block h-8 animate-pulse rounded-lg bg-white/[0.04]" />
          <span className="block h-24 animate-pulse rounded-lg bg-white/[0.04]" />
        </div>
      ) : !outlook || outlook.radiantPct === null ? (
        <p className="text-sm text-muted-foreground">
          The outlook is unavailable right now. The draft works without it.
        </p>
      ) : (
        <OutlookBody outlook={outlook} heroes={heroes} />
      )}
    </section>
  );
}

function OutlookBody({
  outlook,
  heroes,
}: {
  outlook: DraftOutlook;
  heroes: Map<number, DraftHero>;
}) {
  const radiant = outlook.radiantPct ?? 50;
  const dire = 100 - radiant;
  const favoured: Side | null = radiant > 50 ? "radiant" : radiant < 50 ? "dire" : null;
  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1.5 flex items-baseline justify-between text-sm">
          <span className={cn("font-semibold", favoured === "radiant" && "text-win")}>
            Radiant {radiant}%
          </span>
          <span className="text-xs text-muted-foreground">
            {favoured ? `${sideName(favoured)} favoured by the draft` : "Even draft"}
          </span>
          <span className={cn("font-semibold", favoured === "dire" && "text-loss")}>
            {dire}% Dire
          </span>
        </div>
        <div
          className="flex h-2.5 overflow-hidden rounded-full bg-white/[0.06]"
          role="img"
          aria-label={`Estimated win chance from the draft: Radiant ${radiant}%, Dire ${dire}%`}
        >
          <span className="bg-win/80" style={{ width: `${radiant}%` }} />
          <span className="bg-loss/80" style={{ width: `${dire}%` }} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Breakdown sides={outlook.sides} />
        {outlook.notes.length > 0 && (
          <ul className="space-y-1.5 text-sm">
            {outlook.notes.slice(0, 5).map((n) => (
              <li key={n} className="flex gap-2">
                <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-gold" />
                {n}
              </li>
            ))}
          </ul>
        )}
      </div>

      <HeroTable rows={outlook.heroes} heroes={heroes} />
      {outlook.tournaments && (
        <p className="text-xs text-muted-foreground">Tournament numbers: {outlook.tournaments}.</p>
      )}

      <p className="flex gap-1.5 text-xs text-muted-foreground">
        <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        An estimate from the draft alone: hero win rates at Ancient rank and above, head-to-head
        records, and recent tournament drafts. It&apos;s kept between 30% and 70% because players,
        lanes and execution decide most games.
      </p>
    </div>
  );
}

function Breakdown({ sides }: { sides: Record<Side, SideBreakdown> }) {
  const rows: { label: string; hint: string; key: "meta" | "matchups" | "synergy" }[] = [
    { label: "Hero strength", hint: "win rates this patch", key: "meta" },
    { label: "Matchups", hint: "head-to-head records", key: "matchups" },
    { label: "Pairings", hint: "pro results together", key: "synergy" },
  ];
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">Where the estimate comes from, in win-rate points</caption>
      <thead>
        <tr className="text-[0.65rem] tracking-wider text-muted-foreground uppercase">
          <th className="pb-1 text-left font-medium">Points</th>
          <th className="pb-1 text-right font-medium text-win">Radiant</th>
          <th className="pb-1 text-right font-medium text-loss">Dire</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className="border-t border-white/[0.05]">
            <td className="py-1.5">
              {r.label} <span className="text-xs text-muted-foreground">({r.hint})</span>
            </td>
            <td className="py-1.5 text-right tabular-nums">{signed(sides.radiant[r.key])}</td>
            <td className="py-1.5 text-right tabular-nums">{signed(sides.dire[r.key])}</td>
          </tr>
        ))}
        <tr className="border-t border-white/[0.05] text-xs text-muted-foreground">
          <td className="py-1.5">Lineup</td>
          {(["radiant", "dire"] as const).map((s) => (
            <td key={s} className="py-1.5 text-right">
              {sides[s].cores} core{sides[s].cores === 1 ? "" : "s"} · {sides[s].supports} sup
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}

function HeroTable({ rows, heroes }: { rows: OutlookHero[]; heroes: Map<number, DraftHero> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] text-sm">
        <caption className="sr-only">Stats for every picked hero</caption>
        <thead>
          <tr className="text-left text-[0.65rem] tracking-wider text-muted-foreground uppercase">
            <th className="pb-1.5 font-medium">Hero</th>
            <th className="pb-1.5 text-right font-medium">Win rate (Ancient+)</th>
            <th className="pb-1.5 text-right font-medium">Tournaments</th>
            <th className="pb-1.5 pl-4 font-medium">Best matchup</th>
            <th className="pb-1.5 font-medium">Worst matchup</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((h) => {
            const hero = heroes.get(h.heroId);
            return (
              <tr key={h.heroId} className="border-t border-white/[0.05] align-top">
                <td className="py-1.5">
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className={cn(
                        "h-4 w-1 rounded-full",
                        h.side === "radiant" ? "bg-win" : "bg-loss",
                      )}
                    />
                    {hero?.iconUrl && (
                      // eslint-disable-next-line @next/next/no-img-element -- tiny icon
                      <img src={hero.iconUrl} alt="" className="size-5" />
                    )}
                    <span className="font-medium">{h.name}</span>
                    <span className="text-[0.6rem] tracking-wider text-muted-foreground uppercase">
                      {h.role}
                    </span>
                  </span>
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {pct(h.winRate)}
                  {h.games !== null && (
                    <span className="block text-[0.65rem] text-muted-foreground">
                      {h.games.toLocaleString("en-US")} games
                    </span>
                  )}
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {h.contest === null ? (
                    "—"
                  ) : (
                    <>
                      {Math.round(h.contest * 100)}% of drafts
                      <span className="block text-[0.65rem] text-muted-foreground">
                        {h.proPicks} picked · {h.proBans} banned
                        {h.proWinRate !== null && (h.proPicks ?? 0) >= 5
                          ? ` · won ${pct(h.proWinRate)}`
                          : ""}
                      </span>
                    </>
                  )}
                </td>
                <td className="py-1.5 pl-4 text-xs">
                  {h.bestMatchup ? (
                    <span className="text-win">
                      vs {h.bestMatchup.name} {signed(h.bestMatchup.edge)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="py-1.5 text-xs">
                  {h.worstMatchup ? (
                    <span className="text-loss">
                      vs {h.worstMatchup.name} {signed(h.worstMatchup.edge)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
