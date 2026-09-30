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
import type { DraftReport, Grade } from "../domain/draft-report";
import type { DraftState, Side } from "../domain/draft-state";
import type { DraftHero } from "./types";

const pct = (n: number | null) => (n === null ? "—" : `${(n * 100).toFixed(1)}%`);
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n).toFixed(1)}`;
const sideName = (s: Side) => (s === "radiant" ? "Radiant" : "Dire");

/** Positions set by hand: hero id -> position, per side. */
export type RoleChoices = Record<Side, Record<number, Position>>;

export interface OutlookData {
  /** The picks the outlook is for ("" before any pick). */
  picks: string;
  /** Null while loading; `outlook` null when it failed. */
  current: { key: string; outlook: DraftOutlook | null } | null;
  roles: RoleChoices;
  /** Put a hero at a position; whoever held it takes the hero's old position. */
  setRole: (side: Side, heroId: number, position: Position) => void;
  resetRoles: (side: Side) => void;
}

const NO_ROLES: RoleChoices = { radiant: {}, dire: {} };

/**
 * Fetch the outlook whenever a pick lands or a position is changed by hand (bans don't
 * change the lineups). Pass null to skip fetching (when a parent already fetches it).
 */
export function useDraftOutlook(state: DraftState | null): OutlookData {
  const pickIds = state
    ? {
        radiant: state.sides.radiant.picks.map((p) => p.heroId),
        dire: state.sides.dire.picks.map((p) => p.heroId),
      }
    : { radiant: [], dire: [] };
  const picks = [...pickIds.radiant, ...pickIds.dire].join(",");
  const [choices, setChoices] = useState<RoleChoices>(NO_ROLES);
  // Only choices for heroes still picked on that side count.
  const roles: RoleChoices = {
    radiant: Object.fromEntries(
      Object.entries(choices.radiant).filter(([id]) => pickIds.radiant.includes(Number(id))),
    ),
    dire: Object.fromEntries(
      Object.entries(choices.dire).filter(([id]) => pickIds.dire.includes(Number(id))),
    ),
  };
  const key = `${picks}|${JSON.stringify(roles)}`;
  const [result, setResult] = useState<{ key: string; outlook: DraftOutlook | null } | null>(null);

  useEffect(() => {
    if (!picks || !state) return;
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/v1/drafts/outlook", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ snapshot: encodeSnapshot(snapshotOf(state)), roles }),
          signal: controller.signal,
        });
        const outlook = res.ok ? ((await res.json()) as DraftOutlook) : null;
        setResult({ key, outlook });
      } catch {
        if (!controller.signal.aborted) setResult({ key, outlook: null });
      }
    })();
    return () => controller.abort();
    // Keyed on the picks and choices; state is read at that point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Keep showing the last outlook while a position change reloads it.
  const current =
    result?.key === key ? result : result?.key.startsWith(`${picks}|`) ? result : null;

  const setRole = (side: Side, heroId: number, position: Position) => {
    // Pin the side as currently shown, then swap the two heroes involved.
    const shown = new Map(
      (current?.outlook?.heroes ?? [])
        .filter((h) => h.side === side && h.position !== null)
        .map((h) => [h.heroId, h.position!] as const),
    );
    const from = shown.get(heroId);
    const holder = [...shown.entries()].find(([, p]) => p === position)?.[0];
    const next: Record<number, Position> = Object.fromEntries(shown);
    next[heroId] = position;
    if (holder !== undefined && holder !== heroId && from) next[holder] = from;
    setChoices((c) => ({ ...c, [side]: next }));
  };
  const resetRoles = (side: Side) => setChoices((c) => ({ ...c, [side]: {} }));

  return { picks, current, roles, setRole, resetRoles };
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
  const ctl = data ?? own;
  const { picks, current } = ctl;
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
        <OutlookBody outlook={outlook} heroes={heroes} ctl={ctl} />
      )}
    </section>
  );
}

function OutlookBody({
  outlook,
  heroes,
  ctl,
}: {
  outlook: DraftOutlook;
  heroes: Map<number, DraftHero>;
  ctl: OutlookData;
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

      <ReportCard report={outlook.report} />

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
        <Lineups outlook={outlook} heroes={heroes} ctl={ctl} />
        <Lanes lanes={outlook.lanes} heroes={heroes} />
      </div>

      <HeroTable rows={outlook.heroes} heroes={heroes} />
      {outlook.tournaments && (
        <p className="text-xs text-muted-foreground">Tournament numbers: {outlook.tournaments}.</p>
      )}

      <p className="flex gap-1.5 text-xs text-muted-foreground">
        <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        An estimate from the draft alone: hero win rates at Ancient rank and above, head-to-head
        records, pro lane results, pro pairings and recent tournament drafts. It&apos;s kept between
        30% and 70% because players and execution decide most games.
      </p>
    </div>
  );
}

function Breakdown({ sides }: { sides: Record<Side, SideBreakdown> }) {
  const rows: { label: string; hint: string; key: "meta" | "matchups" | "synergy" | "lanes" }[] = [
    { label: "Hero strength", hint: "win rates this patch", key: "meta" },
    { label: "Matchups", hint: "head-to-head records", key: "matchups" },
    { label: "Lanes", hint: "pro lane results", key: "lanes" },
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
function Lineups({
  outlook,
  heroes,
  ctl,
}: {
  outlook: DraftOutlook;
  heroes: Map<number, DraftHero>;
  ctl: OutlookData;
}) {
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
      <RoleEditor outlook={outlook} ctl={ctl} />
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
              <p className="text-[0.7rem] text-muted-foreground">
                {l.source === "pro_lanes"
                  ? `Radiant's heroes won ${l.wins} of ${l.games} of these pro lane meetings (more gold at 10 minutes).`
                  : l.source === "matchups"
                    ? "Few pro lane meetings, so this uses whole-game head-to-heads."
                    : "No games between these heroes yet."}
              </p>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1.5 text-xs text-muted-foreground">
        Lane edges in points: from pro lane results where the heroes met often enough.
      </p>
    </div>
  );
}

/** Change who plays where; the whole analysis follows. Swaps keep one hero per position. */
function RoleEditor({ outlook, ctl }: { outlook: DraftOutlook; ctl: OutlookData }) {
  const sides = (["radiant", "dire"] as const).filter((side) =>
    outlook.heroes.some((h) => h.side === side),
  );
  if (!sides.length) return null;
  return (
    <details
      className="mt-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5"
      open={!outlook.report.provisional}
    >
      <summary className="cursor-pointer text-xs font-medium">Change who plays where</summary>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        {sides.map((side) => {
          const team = outlook.heroes
            .filter((h) => h.side === side)
            .sort((a, b) => (a.position ?? 9) - (b.position ?? 9));
          const custom = Object.keys(ctl.roles[side]).length > 0;
          return (
            <div key={side} className="space-y-1.5">
              <p
                className={cn(
                  "text-[0.65rem] font-semibold tracking-wider uppercase",
                  side === "radiant" ? "text-win" : "text-loss",
                )}
              >
                {sideName(side)}
              </p>
              {team.map((h) => (
                <label key={h.heroId} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{h.name}</span>
                  <select
                    aria-label={`Position for ${h.name}`}
                    value={h.position ?? ""}
                    onChange={(e) =>
                      ctl.setRole(side, h.heroId, Number(e.target.value) as Position)
                    }
                    className="rounded-md border border-white/10 bg-background px-1.5 py-0.5 text-xs"
                  >
                    {POSITIONS.map((p) => (
                      <option key={p} value={p}>
                        {p} · {POSITION_NAMES[p]}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              {custom && (
                <button
                  type="button"
                  onClick={() => ctl.resetRoles(side)}
                  className="text-xs text-gold hover:underline"
                >
                  Use the suggested positions
                </button>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[0.7rem] text-muted-foreground">
        Picking a taken position swaps the two heroes. Lanes, positions and the report card update.
      </p>
    </details>
  );
}

const GRADE_TONE: Record<Grade, string> = {
  A: "text-win",
  B: "text-win/80",
  C: "text-foreground",
  D: "text-loss/80",
  F: "text-loss",
};

/** The rubric: each side graded on six criteria, weighted into an overall grade. */
function ReportCard({ report }: { report: DraftReport }) {
  const overall = (side: Side) => {
    const r = report[side];
    return r.grade ? (
      <span className="flex items-baseline gap-1.5">
        <span className={cn("font-display text-2xl font-bold", GRADE_TONE[r.grade])}>
          {r.grade}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">{r.overall}/100</span>
      </span>
    ) : (
      <span className="text-sm text-muted-foreground">—</span>
    );
  };
  const decider = report.deciders[0];
  return (
    <section
      aria-label="Draft report card"
      className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          Draft report card
          {report.provisional && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              (provisional until both lineups are complete)
            </span>
          )}
        </h3>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-2 text-xs text-win">
            Radiant {overall("radiant")}
          </span>
          <span className="flex items-center gap-2 text-xs text-loss">Dire {overall("dire")}</span>
        </div>
      </div>
      {decider && (
        <p className="mb-2 text-sm">
          The biggest difference is <strong>{decider.label.toLowerCase()}</strong>, in{" "}
          {sideName(decider.favours)}&apos;s favour
          {report.deciders[1]
            ? `, then ${report.deciders[1].label.toLowerCase()} (${sideName(report.deciders[1].favours)})`
            : ""}
          .
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <caption className="sr-only">Grades per criterion for each side</caption>
          <thead>
            <tr className="text-left text-[0.65rem] tracking-wider text-muted-foreground uppercase">
              <th className="pb-1 font-medium">Criterion</th>
              <th className="pb-1 font-medium text-win">Radiant</th>
              <th className="pb-1 font-medium text-loss">Dire</th>
            </tr>
          </thead>
          <tbody>
            {report.radiant.criteria.map((c, i) => {
              const d = report.dire.criteria[i];
              const cell = (x: typeof c) => (
                <td className="py-1.5 pr-3 align-top">
                  <span className="flex items-baseline gap-1.5">
                    <span
                      className={cn(
                        "w-4 font-semibold",
                        x.grade ? GRADE_TONE[x.grade] : "text-muted-foreground",
                      )}
                    >
                      {x.grade ?? "—"}
                    </span>
                    <span className="text-xs text-muted-foreground">{x.summary}</span>
                  </span>
                </td>
              );
              return (
                <tr key={c.key} className="border-t border-white/[0.05]">
                  <th
                    scope="row"
                    className="py-1.5 pr-3 text-left align-top font-medium whitespace-nowrap"
                  >
                    {c.label}
                    <span className="block text-[0.65rem] font-normal text-muted-foreground">
                      {Math.round(c.weight * 100)}% of the grade
                    </span>
                  </th>
                  {cell(c)}
                  {cell(d)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[0.7rem] text-muted-foreground">
        50 is an average draft. A 75+, B 62+, C 50+, D 38+. Criteria without data are left out of
        the overall grade. Composition uses hero role tags.
      </p>
    </section>
  );
}
