"use client";

import { apiRequest } from "@/common/http/api-client";
import { useT } from "@/common/i18n/client";
import { plural } from "@/common/i18n/translate";
import { ChevronDown, Gauge, Info } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { encodeSnapshot, snapshotOf } from "../domain/snapshot";
import type {
  DraftOutlook,
  LaneMatchup,
  OutlookHero,
  SideBreakdown,
} from "../domain/draft-outlook";
import { POSITIONS, type Position } from "../domain/draft-positions";
import type { DraftReport, Grade } from "../domain/draft-report";
import type { DraftState, Side } from "../domain/draft-state";
import { DraftReviewPanel } from "./draft-review-panel";
import { positionName, roleName, sayOr, sideName, type T } from "./i18n";
import type { DraftHero } from "./types";

const pct = (n: number | null) => (n === null ? "—" : `${(n * 100).toFixed(1)}%`);
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n).toFixed(1)}`;

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
        const outlook = await apiRequest<DraftOutlook>("/api/v1/drafts/outlook", {
          method: "POST",
          body: { snapshot: encodeSnapshot(snapshotOf(state)), roles },
          signal: controller.signal,
        }).catch((e: unknown) => {
          if (controller.signal.aborted) throw e;
          return null;
        });
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
  const t = useT();
  const own = useDraftOutlook(data ? null : state);
  const ctl = data ?? own;
  const { picks, current } = ctl;
  const outlook = current?.outlook ?? null;
  // Details stay out of the way while drafting and open once the draft is complete, unless
  // you've chosen otherwise (remembered in this browser).
  const complete = outlook !== null && !outlook.report.provisional;
  // The remembered choice is read after hydration (the server has no storage).
  const stored = useSyncExternalStore(noSubscribe, readOpenChoice, () => null);
  const [choice, setChoice] = useState<boolean | null>(null);
  const expanded = choice ?? stored ?? complete;
  const toggle = () => {
    setChoice(!expanded);
    writeOpenChoice(!expanded);
  };

  return (
    <section className="panel p-4" aria-label={t("drafts.outlook.label")}>
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Gauge aria-hidden className="size-4 text-gold" /> {t("drafts.outlook.title")}
          <span className="rounded border border-white/15 px-1.5 text-[0.6rem] font-medium tracking-wider text-muted-foreground uppercase">
            {t("drafts.outlook.estimate")}
          </span>
        </h2>
        <span className="flex flex-wrap items-center gap-3">
          {outlook && (
            <span className="text-xs text-muted-foreground">
              {outlook.confidence === "medium"
                ? t("drafts.outlook.medium")
                : t("drafts.outlook.low")}{" "}
              · {t("drafts.outlook.coverage", { pct: Math.round(outlook.coverage * 100) })}
            </span>
          )}
          {outlook && outlook.radiantPct !== null && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-expanded={expanded}
              aria-controls="outlook-details"
              onClick={toggle}
              className="h-7 gap-1 px-2 text-xs"
            >
              <ChevronDown
                aria-hidden
                className={cn("size-3.5 transition-transform", expanded && "rotate-180")}
              />
              {expanded ? t("drafts.outlook.hide") : t("drafts.outlook.show")}
            </Button>
          )}
        </span>
      </header>

      {!picks ? (
        <p className="text-sm text-muted-foreground">{t("drafts.outlook.empty")}</p>
      ) : !current ? (
        <div className="space-y-3" aria-busy>
          <span className="block h-8 animate-pulse rounded-lg bg-white/[0.04]" />
          <span className="block h-24 animate-pulse rounded-lg bg-white/[0.04]" />
        </div>
      ) : !outlook || outlook.radiantPct === null ? (
        <p className="text-sm text-muted-foreground">{t("drafts.outlook.unavailable")}</p>
      ) : (
        <>
          <OutlookBody outlook={outlook} heroes={heroes} ctl={ctl} details={expanded} />
          {expanded && !outlook.report.provisional && (
            <div className="mt-4">
              <DraftReviewPanel state={state} roles={ctl.roles} />
            </div>
          )}
        </>
      )}
    </section>
  );
}

const OPEN_KEY = "dd:outlook-details";
const noSubscribe = () => () => {};

function readOpenChoice(): boolean | null {
  try {
    const v = window.localStorage.getItem(OPEN_KEY);
    return v === "1" ? true : v === "0" ? false : null;
  } catch {
    return null;
  }
}

function writeOpenChoice(open: boolean) {
  try {
    window.localStorage.setItem(OPEN_KEY, open ? "1" : "0");
  } catch {
    // Storage blocked: the choice just isn't remembered.
  }
}

function OutlookBody({
  outlook,
  heroes,
  ctl,
  details,
}: {
  outlook: DraftOutlook;
  heroes: Map<number, DraftHero>;
  ctl: OutlookData;
  /** Show the evidence (report card, lanes, lineups) under the win-chance bar. */
  details: boolean;
}) {
  const t = useT();
  const radiant = outlook.radiantPct ?? 50;
  const dire = 100 - radiant;
  const favoured: Side | null = radiant > 50 ? "radiant" : radiant < 50 ? "dire" : null;
  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1.5 flex items-baseline justify-between text-sm">
          <span className={cn("font-semibold", favoured === "radiant" && "text-win")}>
            {t("drafts.outlook.radiantPct", { pct: radiant })}
          </span>
          <span className="text-xs text-muted-foreground">
            {favoured
              ? t("drafts.outlook.favoured", { side: sideName(t, favoured) })
              : t("drafts.outlook.even")}
          </span>
          <span className={cn("font-semibold", favoured === "dire" && "text-loss")}>
            {t("drafts.outlook.direPct", { pct: dire })}
          </span>
        </div>
        <div
          className="flex h-2.5 overflow-hidden rounded-full bg-white/[0.06]"
          role="img"
          aria-label={t("drafts.outlook.barLabel", { radiant, dire })}
        >
          <span className="bg-win/80" style={{ width: `${radiant}%` }} />
          <span className="bg-loss/80" style={{ width: `${dire}%` }} />
        </div>
      </div>

      {details && (
        <div id="outlook-details" className="space-y-4">
          <ReportCard report={outlook.report} />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
            <Breakdown sides={outlook.sides} />
            {outlook.notes.length > 0 && (
              <ul className="space-y-1.5 text-sm">
                {outlook.notes.slice(0, 5).map((n, i) => (
                  <li key={n} className="flex gap-2">
                    <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-gold" />
                    {sayOr(t, outlook.notePhrases?.[i], n)}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Lineups outlook={outlook} heroes={heroes} ctl={ctl} />
            <Lanes lanes={outlook.lanes} heroes={heroes} />
          </div>

          <HeroTable rows={outlook.heroes} heroes={heroes} />
          {outlook.tournaments && (
            <p className="text-xs text-muted-foreground">
              {t("drafts.outlook.tournaments", {
                source: sayOr(t, outlook.tournamentsPhrase, outlook.tournaments),
              })}
            </p>
          )}
        </div>
      )}

      <p className="flex gap-1.5 text-xs text-muted-foreground">
        <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        {t("drafts.outlook.footnote", {
          source: outlook.accuracy.source,
          games: outlook.accuracy.testGames.toLocaleString("en-US"),
          fitted: Math.round(outlook.accuracy.fitted * 100),
          radiant: Math.round(outlook.accuracy.radiantShare * 100),
        })}
      </p>
    </div>
  );
}

function Breakdown({ sides }: { sides: Record<Side, SideBreakdown> }) {
  const t = useT();
  const rows: { label: string; hint: string; key: "meta" | "matchups" | "synergy" | "lanes" }[] = [
    {
      label: t("drafts.breakdown.strength"),
      hint: t("drafts.breakdown.strengthHint"),
      key: "meta",
    },
    {
      label: t("drafts.breakdown.matchups"),
      hint: t("drafts.breakdown.matchupsHint"),
      key: "matchups",
    },
    { label: t("drafts.breakdown.lanes"), hint: t("drafts.breakdown.lanesHint"), key: "lanes" },
    {
      label: t("drafts.breakdown.pairings"),
      hint: t("drafts.breakdown.pairingsHint"),
      key: "synergy",
    },
  ];
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">{t("drafts.breakdown.caption")}</caption>
      <thead>
        <tr className="text-[0.65rem] tracking-wider text-muted-foreground uppercase">
          <th className="pb-1 text-left font-medium">{t("drafts.breakdown.points")}</th>
          <th className="pb-1 text-right font-medium text-win">{sideName(t, "radiant")}</th>
          <th className="pb-1 text-right font-medium text-loss">{sideName(t, "dire")}</th>
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
          <td className="py-1.5">{t("drafts.breakdown.lineup")}</td>
          {(["radiant", "dire"] as const).map((s) => (
            <td key={s} className="py-1.5 text-right">
              {plural(t, "drafts.breakdown.cores", sides[s].cores)} ·{" "}
              {t("drafts.breakdown.sup", { n: sides[s].supports })}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}

function HeroTable({ rows, heroes }: { rows: OutlookHero[]; heroes: Map<number, DraftHero> }) {
  const t = useT();
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] text-sm">
        <caption className="sr-only">{t("drafts.heroTable.caption")}</caption>
        <thead>
          <tr className="text-left text-[0.65rem] tracking-wider text-muted-foreground uppercase">
            <th className="pb-1.5 font-medium">{t("drafts.heroTable.hero")}</th>
            <th className="pb-1.5 text-right font-medium">{t("drafts.heroTable.winRate")}</th>
            <th className="pb-1.5 text-right font-medium">{t("drafts.heroTable.tournaments")}</th>
            <th className="pb-1.5 pl-4 font-medium">{t("drafts.heroTable.best")}</th>
            <th className="pb-1.5 font-medium">{t("drafts.heroTable.worst")}</th>
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
                      {h.position
                        ? t("drafts.heroTable.pos", { n: h.position })
                        : roleName(t, h.role)}
                    </span>
                  </span>
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {pct(h.winRate)}
                  {h.games !== null && (
                    <span className="block text-[0.65rem] text-muted-foreground">
                      {t("drafts.heroTable.games", { n: h.games.toLocaleString("en-US") })}
                    </span>
                  )}
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {h.contest === null ? (
                    "—"
                  ) : (
                    <>
                      {t("drafts.heroTable.drafts", { pct: Math.round(h.contest * 100) })}
                      <span className="block text-[0.65rem] text-muted-foreground">
                        {t("drafts.heroTable.pickedBanned", {
                          picks: h.proPicks ?? 0,
                          bans: h.proBans ?? 0,
                        })}
                        {h.proWinRate !== null && (h.proPicks ?? 0) >= 5
                          ? t("drafts.heroTable.won", { pct: pct(h.proWinRate) })
                          : ""}
                      </span>
                    </>
                  )}
                </td>
                <td className="py-1.5 pl-4 text-xs">
                  {h.bestMatchup ? (
                    <span className="text-win">
                      {t("drafts.heroTable.vs", {
                        hero: h.bestMatchup.name,
                        edge: signed(h.bestMatchup.edge),
                      })}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="py-1.5 text-xs">
                  {h.worstMatchup ? (
                    <span className="text-loss">
                      {t("drafts.heroTable.vs", {
                        hero: h.worstMatchup.name,
                        edge: signed(h.worstMatchup.edge),
                      })}
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
  const t = useT();
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
        {t("drafts.lineups.open")}
      </span>
    );
  return (
    <div>
      <h3 className="mb-1.5 text-[0.65rem] font-medium tracking-wider text-muted-foreground uppercase">
        {t("drafts.lineups.title")}
      </h3>
      <table className="w-full table-fixed text-sm">
        <caption className="sr-only">{t("drafts.lineups.caption")}</caption>
        <thead className="sr-only">
          <tr>
            <th>{sideName(t, "radiant")}</th>
            <th>{t("drafts.lineups.position")}</th>
            <th>{sideName(t, "dire")}</th>
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
                {p} · {positionName(t, p)}
              </th>
              <td className="py-1.5 pl-2">{cell(at("dire", p), "dire")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1.5 text-xs text-muted-foreground">
        {outlook.positionsFrom === "pro"
          ? t("drafts.lineups.fromPro")
          : t("drafts.lineups.fromTags")}
      </p>
      <RoleEditor outlook={outlook} ctl={ctl} />
    </div>
  );
}

function Share({ h }: { h: OutlookHero }) {
  const t = useT();
  if (h.positionShare === null) return null;
  const odd = h.positionShare < 0.1;
  return (
    <span
      className={cn(
        "shrink-0 text-[0.65rem] tabular-nums",
        odd ? "text-loss" : "text-muted-foreground",
      )}
      title={t("drafts.lineups.shareTitle", {
        hero: h.name,
        pct: Math.round(h.positionShare * 100),
      })}
    >
      {Math.round(h.positionShare * 100)}%
    </span>
  );
}

/** Who meets whom in each lane, with Radiant's head-to-head edge there. */
function Lanes({ lanes, heroes }: { lanes: LaneMatchup[]; heroes: Map<number, DraftHero> }) {
  const t = useT();
  const names = (ids: number[]) =>
    ids.map((id) => heroes.get(id)?.name ?? `Hero ${id}`).join(" + ");
  return (
    <div>
      <h3 className="mb-1.5 text-[0.65rem] font-medium tracking-wider text-muted-foreground uppercase">
        {t("drafts.lanes.title")}
      </h3>
      {lanes.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("drafts.lanes.empty")}</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {lanes.map((l) => (
            <li
              key={l.lane}
              className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {t(`drafts.phrases.lanes.${l.lane}`)}
                </span>
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
                    ? t("drafts.lanes.notEnough")
                    : l.edge === 0
                      ? t("drafts.lanes.even")
                      : `${sideName(t, l.edge > 0 ? "radiant" : "dire")} ${signed(Math.abs(l.edge))}`}
                </span>
              </div>
              <p className="mt-0.5">
                <span className="text-win">{names(l.radiant)}</span>
                <span className="text-muted-foreground">{t("drafts.lanes.vs")}</span>
                <span className="text-loss">{names(l.dire)}</span>
              </p>
              <p className="text-[0.7rem] text-muted-foreground">
                {l.source === "pro_lanes"
                  ? t("drafts.lanes.proLanes", { wins: l.wins, games: l.games })
                  : l.source === "matchups"
                    ? t("drafts.lanes.matchups")
                    : t("drafts.lanes.none")}
              </p>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1.5 text-xs text-muted-foreground">{t("drafts.lanes.footnote")}</p>
    </div>
  );
}

/** Change who plays where; the whole analysis follows. Swaps keep one hero per position. */
function RoleEditor({ outlook, ctl }: { outlook: DraftOutlook; ctl: OutlookData }) {
  const t = useT();
  const sides = (["radiant", "dire"] as const).filter((side) =>
    outlook.heroes.some((h) => h.side === side),
  );
  if (!sides.length) return null;
  return (
    <details
      className="mt-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5"
      open={!outlook.report.provisional}
    >
      <summary className="cursor-pointer text-xs font-medium">{t("drafts.lineups.change")}</summary>
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                {sideName(t, side)}
              </p>
              {team.map((h) => (
                <label key={h.heroId} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{h.name}</span>
                  <select
                    aria-label={t("drafts.lineups.positionFor", { hero: h.name })}
                    value={h.position ?? ""}
                    onChange={(e) =>
                      ctl.setRole(side, h.heroId, Number(e.target.value) as Position)
                    }
                    className="rounded-md border border-white/10 bg-background px-1.5 py-0.5 text-xs"
                  >
                    {POSITIONS.map((p) => (
                      <option key={p} value={p}>
                        {p} · {positionName(t, p)}
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
                  {t("drafts.lineups.useSuggested")}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[0.7rem] text-muted-foreground">{t("drafts.lineups.swapNote")}</p>
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

/** ", in Radiant's favour, then counters (Dire)." after the biggest difference. */
function deciderRest(t: T, report: DraftReport): string {
  const [first, second] = report.deciders;
  return t("drafts.report.deciderAfter", {
    side: sideName(t, first.favours),
    then: second
      ? t("drafts.report.then", {
          criterion: t(`drafts.report.criteriaLower.${second.key}`),
          side: sideName(t, second.favours),
        })
      : "",
  });
}

/** The rubric: each side graded on six criteria, weighted into an overall grade. */
function ReportCard({ report }: { report: DraftReport }) {
  const t = useT();
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
      aria-label={t("drafts.report.label")}
      className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          {t("drafts.report.title")}
          {report.provisional && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {t("drafts.report.provisional")}
            </span>
          )}
        </h3>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-2 text-xs text-win">
            {sideName(t, "radiant")} {overall("radiant")}
          </span>
          <span className="flex items-center gap-2 text-xs text-loss">
            {sideName(t, "dire")} {overall("dire")}
          </span>
        </div>
      </div>
      {decider && (
        <p className="mb-2 text-sm">
          {t("drafts.report.deciderBefore")}{" "}
          <strong>{t(`drafts.report.criteriaLower.${decider.key}`)}</strong>
          {deciderRest(t, report)}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <caption className="sr-only">Grades per criterion for each side</caption>
          <thead>
            <tr className="text-left text-[0.65rem] tracking-wider text-muted-foreground uppercase">
              <th className="pb-1 font-medium">{t("drafts.report.criterion")}</th>
              <th className="pb-1 font-medium text-win">{sideName(t, "radiant")}</th>
              <th className="pb-1 font-medium text-loss">{sideName(t, "dire")}</th>
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
                    <span className="text-xs text-muted-foreground">
                      {sayOr(t, x.summaryPhrase, x.summary)}
                    </span>
                  </span>
                </td>
              );
              return (
                <tr key={c.key} className="border-t border-white/[0.05]">
                  <th
                    scope="row"
                    className="py-1.5 pr-3 text-left align-top font-medium whitespace-nowrap"
                  >
                    {t(`drafts.report.criteria.${c.key}`)}
                    <span className="block text-[0.65rem] font-normal text-muted-foreground">
                      {t("drafts.report.weight", { pct: Math.round(c.weight * 100) })}
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
      <p className="mt-2 text-[0.7rem] text-muted-foreground">{t("drafts.report.footnote")}</p>
    </section>
  );
}
