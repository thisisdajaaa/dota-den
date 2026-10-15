"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/common/i18n/client";
import { MEDALS } from "@/modules/matches/domain/rank-tier";
import { medalStep } from "../domain/journey";

export interface JourneyChartMedal {
  t: number;
  rankTier: number;
  /** "Legend 3", as shown everywhere else. */
  label: string;
  dateLabel: string;
}

export interface JourneyChartEntry {
  t: number;
  mmr: number;
  dateLabel: string;
}

export interface JourneyChartBand {
  from: number;
  to: number;
  tone: "win" | "loss";
  /** The lane the stretch belongs to: medal stretches and MMR stretches are separate. */
  lane: "medal" | "mmr";
}

const MMR_H = 130;
const AXIS_H = 24;
const PAD = { top: 22, right: 16, left: 72, lane: 34 };
const DAY_MS = 86_400_000;

/**
 * One timeline for the rank journey. Top lane: the medal as a step line (one step per star),
 * from each sighting of a new medal until it was last confirmed. Bottom lane (optional, never on
 * shares): logged MMR as dots, joined by a dashed line except across long gaps, where it breaks.
 * Shaded bands mark the best climb and worst slide, each in its own lane. The page also renders a table of the same
 * points for screen readers and anyone who prefers one.
 */
export function JourneyChart({
  from,
  to,
  medals,
  medalEnd,
  entries,
  gapDays,
  bands,
  ariaLabel,
}: {
  from: number;
  to: number;
  medals: JourneyChartMedal[];
  /** Last time the latest medal was confirmed: the step line stops there. */
  medalEnd: number | null;
  /** Null hides the MMR lane (shares are medal-only). */
  entries: JourneyChartEntry[] | null;
  gapDays: number;
  bands: JourneyChartBand[];
  ariaLabel: string;
}) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Medal lane: steps from one below the lowest to one above the highest.
  const steps = medals.map((m) => medalStep(m.rankTier));
  const sLo = steps.length ? Math.max(0, Math.min(...steps) - 1) : 0;
  const sHi = steps.length ? Math.min(35, Math.max(...steps) + 1) : 1;
  const medalH = Math.min(170, Math.max(80, (sHi - sLo) * 16 + 24));

  const showMmr = entries !== null && entries.length > 0;
  const height = PAD.top + medalH + (showMmr ? PAD.lane + MMR_H : 0) + AXIS_H;
  const span = Math.max(to - from, DAY_MS);
  const innerW = width - PAD.left - PAD.right;
  const x = (v: number) => PAD.left + ((Math.min(Math.max(v, from), to) - from) / span) * innerW;

  const medalTop = PAD.top;
  const ys = (s: number) => medalTop + 8 + ((sHi - s) / Math.max(sHi - sLo, 1)) * (medalH - 16);
  // Medal names at the first star of each medal in view (Immortal at its own step).
  const medalTicks = MEDALS.map((name, i) => ({ name, step: i * 5 })).filter(
    (m) => m.step >= sLo && m.step <= sHi,
  );
  if (medalTicks.length === 0 && steps.length)
    medalTicks.push({
      name: MEDALS[Math.min(7, Math.floor(Math.min(...steps) / 5))],
      step: Math.min(...steps),
    });

  let stepPath = "";
  medals.forEach((m, i) => {
    const y = ys(steps[i]).toFixed(1);
    const x0 = x(m.t).toFixed(1);
    stepPath += i === 0 ? `M${x0},${y}` : `V${y}`;
    const next = medals[i + 1]?.t ?? Math.min(medalEnd ?? to, to);
    stepPath += `H${x(Math.max(next, m.t)).toFixed(1)}`;
  });

  // MMR lane.
  const mmrTop = PAD.top + medalH + PAD.lane;
  const values = showMmr ? entries.map((e) => e.mmr) : [0];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = Math.max(25, Math.round((hi - lo) * 0.15));
  const yMin = Math.floor((lo - pad) / 25) * 25;
  const yMax = Math.ceil((hi + pad) / 25) * 25;
  const ym = (v: number) => mmrTop + 6 + ((yMax - v) / (yMax - yMin)) * (MMR_H - 12);
  const segments: string[] = [];
  if (showMmr)
    entries.forEach((e, i) => {
      const prev = entries[i - 1];
      const joined = prev && (e.t - prev.t) / DAY_MS <= gapDays;
      const pt = `${x(e.t).toFixed(1)},${ym(e.mmr).toFixed(1)}`;
      if (joined) segments[segments.length - 1] += `L${pt}`;
      else segments.push(`M${pt}`);
    });

  // Month ticks, thinned to about one per 90px.
  const months: number[] = [];
  const cursor = new Date(from);
  cursor.setUTCDate(1);
  cursor.setUTCHours(0, 0, 0, 0);
  cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  while (cursor.getTime() <= to) {
    months.push(cursor.getTime());
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  const every = Math.max(1, Math.ceil(months.length / Math.max(1, Math.floor(innerW / 90))));
  const monthFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    year: span > 330 * DAY_MS ? "2-digit" : undefined,
  });
  const bottom = height - AXIS_H;

  // Medal labels on the line, skipped where they'd overlap the previous one.
  const medalLabels: boolean[] = [];
  for (let i = 0, lastX = -Infinity; i < medals.length; i++) {
    const lx = x(medals[i].t);
    const show = lx - lastX > 84 && lx < width - PAD.right - 40;
    if (show) lastX = lx;
    medalLabels.push(show);
  }

  const point = (key: string, label: string) => ({
    tabIndex: 0,
    role: "button" as const,
    "aria-label": label,
    onMouseEnter: () => setActive(label),
    onMouseLeave: () => setActive(null),
    onFocus: () => setActive(label),
    onBlur: () => setActive(null),
    className: "cursor-pointer outline-none",
    "data-key": key,
  });

  return (
    <div ref={ref} className="space-y-2">
      <p className="min-h-4 text-xs text-muted-foreground" aria-live="polite">
        {active ? (
          <span className="font-semibold text-foreground">{active}</span>
        ) : (
          t("mmr.journey.hint")
        )}
      </p>
      <svg width={width} height={height} role="group" aria-label={ariaLabel} className="block">
        {bands
          .filter((b) => b.lane === "medal" || showMmr)
          .map((b, i) => (
            <rect
              key={i}
              x={x(b.from)}
              y={b.lane === "medal" ? medalTop : mmrTop}
              width={Math.max(2, x(b.to) - x(b.from))}
              height={b.lane === "medal" ? medalH : MMR_H}
              className={b.tone === "win" ? "fill-win/10" : "fill-loss/10"}
            />
          ))}

        {/* Medal lane */}
        <text
          x={PAD.left}
          y={medalTop - 8}
          className="fill-muted-foreground text-[10px] tracking-wider uppercase"
        >
          {t("mmr.journey.medalLane")}
        </text>
        {medalTicks.map((m) => (
          <g key={m.name}>
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={ys(m.step)}
              y2={ys(m.step)}
              className="stroke-white/[0.06]"
            />
            <text
              x={PAD.left - 8}
              y={ys(m.step)}
              dy="0.32em"
              textAnchor="end"
              className="fill-muted-foreground text-[10px]"
            >
              {m.name}
            </text>
          </g>
        ))}
        {medals.length > 0 && (
          <path
            d={stepPath}
            fill="none"
            className="stroke-gold"
            strokeWidth={2.5}
            strokeLinejoin="round"
          />
        )}
        {medals.map((m, i) => {
          const label = t("mmr.journey.medalPoint", { medal: m.label, date: m.dateLabel });
          return (
            <g key={`m${m.t}`}>
              {medalLabels[i] && (
                <text
                  x={x(m.t) + 4}
                  y={ys(steps[i]) - 8}
                  className="fill-foreground text-[11px] font-medium"
                >
                  {m.label}
                </text>
              )}
              <circle
                cx={x(m.t)}
                cy={ys(steps[i])}
                r={12}
                fill="transparent"
                {...point(`m${i}`, label)}
              />
              <circle
                cx={x(m.t)}
                cy={ys(steps[i])}
                r={active === label ? 6 : 4}
                className="pointer-events-none fill-gold stroke-card"
                strokeWidth={2}
              />
            </g>
          );
        })}

        {/* Logged MMR lane */}
        {showMmr && (
          <g>
            <text
              x={PAD.left}
              y={mmrTop - 8}
              className="fill-muted-foreground text-[10px] tracking-wider uppercase"
            >
              {t("mmr.journey.mmrLane")}
            </text>
            {[yMin, yMax].map((v) => (
              <g key={v}>
                <line
                  x1={PAD.left}
                  x2={width - PAD.right}
                  y1={ym(v)}
                  y2={ym(v)}
                  className="stroke-white/[0.06]"
                />
                <text
                  x={PAD.left - 8}
                  y={ym(v)}
                  dy="0.32em"
                  textAnchor="end"
                  className="fill-muted-foreground text-[10px] tabular-nums"
                >
                  {v.toLocaleString("en-US")}
                </text>
              </g>
            ))}
            {segments.map((d, i) => (
              <path
                key={i}
                d={d}
                fill="none"
                className="stroke-chart-4/70"
                strokeWidth={2}
                strokeDasharray="4 4"
                strokeLinejoin="round"
              />
            ))}
            {entries.map((e, i) => {
              const label = t("mmr.journey.mmrPoint", {
                mmr: e.mmr.toLocaleString("en-US"),
                date: e.dateLabel,
              });
              return (
                <g key={`e${i}`}>
                  <circle
                    cx={x(e.t)}
                    cy={ym(e.mmr)}
                    r={12}
                    fill="transparent"
                    {...point(`e${i}`, label)}
                  />
                  <circle
                    cx={x(e.t)}
                    cy={ym(e.mmr)}
                    r={active === label ? 5.5 : 4}
                    className="pointer-events-none fill-chart-4 stroke-card"
                    strokeWidth={2}
                  />
                </g>
              );
            })}
          </g>
        )}

        {/* Time axis */}
        <line
          x1={PAD.left}
          x2={width - PAD.right}
          y1={bottom}
          y2={bottom}
          className="stroke-white/[0.1]"
        />
        {months.map((m, i) =>
          i % every === 0 ? (
            <text
              key={m}
              x={x(m)}
              y={bottom + 16}
              textAnchor="middle"
              className="fill-muted-foreground text-[10px]"
            >
              {monthFmt.format(new Date(m))}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}
