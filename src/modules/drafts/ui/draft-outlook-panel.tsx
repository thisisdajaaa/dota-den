"use client";

import { Gauge, Info } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "cn";
import { encodeSnapshot, snapshotOf } from "../application/snapshot";
import type {
  DraftOutlook,
  LaneMatchup,
  OutlookHero,
  SideBreakdown,
} from "../domain/draft-outlook";
import { POSITIONS, POSITION_NAMES, type Position } from "../domain/draft-positions";
import type { DraftState, Side } from "../domain/draft-state";
import type { DraftHero } from "./types";

const pct = (n: number | null) => (n === null ? "—" : `${(n * 100).toFixed(1)}%`);
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n).toFixed(1)}`;
const sideName = (s: Side) => (s === "radiant" ? "Radiant" : "Dire");

export interface OutlookData {
  /** The picks the outlook is for ("" before any pick). */
  picks: string;
  /** Null while loading; `outlook` null when it failed. */
  current: { key: string; outlook: DraftOutlook | null } | null;
}

/**
 * Fetch the outlook whenever a pick lands (bans don't change the lineups). Pass null to
 * skip fetching (when a parent already fetches it).
 */
export function useDraftOutlook(state: DraftState | null): OutlookData {
  const picks = state
    ? [...state.sides.radiant.picks, ...state.sides.dire.picks].map((p) => p.heroId).join(",")
    : "";
  const [result, setResult] = useState<{ key: string; outlook: DraftOutlook | null } | null>(null);

  useEffect(() => {
    if (!picks || !state) return;
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

  return { picks, current: result?.key === picks ? result : null };
}

/** Where each picked hero plays, from an outlook (for the team panels). */
export function positionsFrom(data: OutlookData): Map<number, Position> {
  return new Map(
    (data.current?.outlook?.heroes ?? [])
      .filter((h) => h.position !== null)
      .map((h) => [h.heroId, h.position!]),
  );
}

/**
 * Which side the draft favours so far, with its evidence. Always labelled as an estimate.
 * Pass `data` when the parent already fetches the outlook; otherwise it fetches its own.
 */
export function DraftOutlookPanel({
  state,
  heroes,
  data,
}: {
  state: DraftState;
  heroes: Map<number, DraftHero>;
  data?: OutlookData;
}) {
  const own = useDraftOutlook(data ? null : state);
  const { picks, current } = data ?? own;
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

      <div className="grid gap-4 lg:grid-cols-2">
        <Lineups outlook={outlook} heroes={heroes} />
        <Lanes lanes={outlook.lanes} heroes={heroes} />
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
                      {h.position ? `Pos ${h.position}` : h.role}
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

/** Both lineups by position, with open slots, so it's clear who plays where. */
function Lineups({ outlook, heroes }: { outlook: DraftOutlook; heroes: Map<number, DraftHero> }) {
  const at = (side: Side, p: Position) =>
    outlook.heroes.find((h) => h.side === side && h.position === p) ?? null;
  const cell = (h: OutlookHero | null, side: Side) =>
    h ? (
      <span className={cn("flex items-center gap-1.5", side === "dire" && "justify-end")}>
        {side === "dire" && <Share h={h} />}
        {heroes.get(h.heroId)?.iconUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- tiny icon
          <img src={heroes.get(h.heroId)!.iconUrl!} alt="" className="size-5" />
        )}
        <span className="truncate font-medium">{h.name}</span>
        {side === "radiant" && <Share h={h} />}
      </span>
    ) : (
      <span
        className={cn("block text-muted-foreground/70 italic", side === "dire" && "text-right")}
      >
        Open
      </span>
    );
  return (
    <div>
      <h3 className="mb-1.5 text-[0.65rem] font-medium tracking-wider text-muted-foreground uppercase">
        Lineups by position
      </h3>
      <table className="w-full table-fixed text-sm">
        <caption className="sr-only">Which hero plays each position on each side</caption>
        <thead className="sr-only">
          <tr>
            <th>Radiant</th>
            <th>Position</th>
            <th>Dire</th>
          </tr>
        </thead>
        <tbody>
          {POSITIONS.map((p) => (
            <tr key={p} className="border-t border-white/[0.05]">
              <td className="py-1.5 pr-2">{cell(at("radiant", p), "radiant")}</td>
              <th
                scope="row"
                className="w-28 py-1.5 text-center text-[0.7rem] font-medium whitespace-nowrap text-muted-foreground"
              >
                {p} · {POSITION_NAMES[p]}
              </th>
              <td className="py-1.5 pl-2">{cell(at("dire", p), "dire")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1.5 text-xs text-muted-foreground">
        {outlook.positionsFrom === "pro"
          ? "Positions from where the pros play each hero (last 60 days); the % is how often."
          : "Pro position data is unavailable right now, so positions are estimated from hero role tags."}
      </p>
    </div>
  );
}

function Share({ h }: { h: OutlookHero }) {
  if (h.positionShare === null) return null;
  const odd = h.positionShare < 0.1;
  return (
    <span
      className={cn(
        "shrink-0 text-[0.65rem] tabular-nums",
        odd ? "text-loss" : "text-muted-foreground",
      )}
      title={`Pros play ${h.name} here in ${Math.round(h.positionShare * 100)}% of games`}
    >
      {Math.round(h.positionShare * 100)}%
    </span>
  );
}

/** Who meets whom in each lane, with Radiant's head-to-head edge there. */
function Lanes({ lanes, heroes }: { lanes: LaneMatchup[]; heroes: Map<number, DraftHero> }) {
  const names = (ids: number[]) =>
    ids.map((id) => heroes.get(id)?.name ?? `Hero ${id}`).join(" + ");
  return (
    <div>
      <h3 className="mb-1.5 text-[0.65rem] font-medium tracking-wider text-muted-foreground uppercase">
        Lanes
      </h3>
      {lanes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Lane matchups appear once both sides have heroes in the same lane.
        </p>
      ) : (
        <ul className="space-y-2 text-sm">
          {lanes.map((l) => (
            <li
              key={l.lane}
              className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs text-muted-foreground">{l.label}</span>
                <span
                  className={cn(
                    "text-xs font-semibold tabular-nums",
                    l.edge === null
                      ? "text-muted-foreground"
                      : l.edge > 0
                        ? "text-win"
                        : l.edge < 0
                          ? "text-loss"
                          : "",
                  )}
                >
                  {l.edge === null
                    ? "Not enough games"
                    : l.edge === 0
                      ? "Even"
                      : `${l.edge > 0 ? "Radiant" : "Dire"} ${signed(Math.abs(l.edge))}`}
                </span>
              </div>
              <p className="mt-0.5">
                <span className="text-win">{names(l.radiant)}</span>
                <span className="text-muted-foreground"> vs </span>
                <span className="text-loss">{names(l.dire)}</span>
              </p>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1.5 text-xs text-muted-foreground">
        Head-to-head records of the heroes meeting in each lane, in win-rate points.
      </p>
    </div>
  );
}
