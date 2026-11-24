"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/common/i18n/client";
import { MEDALS } from "@/modules/matches/domain/rank-tier";
import { mmrTicks, tickLabel, timeDomain, timeTicks } from "@/common/charts/axes";
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
  /** Shown at the top of the band ("Best medal climb"). */
  label?: string;
}

const MMR_H = 140;
const AXIS_H = 26;
const PAD = { top: 26, right: 20, left: 76, lane: 40 };
const DAY_MS = 86_400_000;
/** Rough width of one character of the 11px label font, for collision checks. */
const CHAR_W = 6.4;

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
const hits = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

type Active = { key: string; label: string; x: number; y: number };

/**
 * One timeline for the rank journey. Top lane: the medal as a step line (one step per star),
 * from each sighting of a new medal until it was last confirmed. Bottom lane (optional, never on
 * shares): logged MMR as dots, joined by a dashed line except across long gaps, where it breaks.
 * Labelled shaded bands mark the best climb and worst slide, each in its own lane. The page also
 * renders a table of the same points for screen readers and anyone who prefers one.
 */
export function JourneyChart({
  from: rangeFrom,
  to: rangeTo,
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
  const [active, setActive] = useState<Active | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const showMmr = entries !== null && entries.length > 0;
  const firstData = Math.min(
    medals[0]?.t ?? Infinity,
    showMmr ? (entries[0]?.t ?? Infinity) : Infinity,
  );
  const { from, to } = timeDomain(
    rangeFrom,
    rangeTo,
    Number.isFinite(firstData) ? firstData : null,
  );

  // Medal lane: steps from one below the lowest to one above the highest.
  const steps = medals.map((m) => medalStep(m.rankTier));
  const sLo = steps.length ? Math.max(0, Math.min(...steps) - 1) : 0;
  const sHi = steps.length ? Math.min(35, Math.max(...steps) + 1) : 1;
  const medalH = Math.min(180, Math.max(96, (sHi - sLo) * 14 + 32));

  const height = PAD.top + medalH + (showMmr ? PAD.lane + MMR_H : 0) + AXIS_H;
  const span = Math.max(to - from, DAY_MS);
  const innerW = width - PAD.left - PAD.right;
  const x = (v: number) => PAD.left + ((Math.min(Math.max(v, from), to) - from) / span) * innerW;
  const right = width - PAD.right;

  const medalTop = PAD.top;
  const ys = (s: number) => medalTop + 10 + ((sHi - s) / Math.max(sHi - sLo, 1)) * (medalH - 20);
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

  // MMR lane, on round ticks.
  const mmrTop = PAD.top + medalH + PAD.lane;
  const values = showMmr ? entries.map((e) => e.mmr) : [0];
  const axis = mmrTicks(Math.min(...values), Math.max(...values));
  const ym = (v: number) => mmrTop + 6 + ((axis.max - v) / (axis.max - axis.min)) * (MMR_H - 12);
  const segments: string[] = [];
  if (showMmr)
    entries.forEach((e, i) => {
      const prev = entries[i - 1];
      const joined = prev && (e.t - prev.t) / DAY_MS <= gapDays;
      const pt = `${x(e.t).toFixed(1)},${ym(e.mmr).toFixed(1)}`;
      if (joined) segments[segments.length - 1] += `L${pt}`;
      else segments.push(`M${pt}`);
    });

  // Time ticks, thinned to about one per 80px.
  const ticks = timeTicks(from, to);
  const every = Math.max(1, Math.ceil(ticks.length / Math.max(1, Math.floor(innerW / 80))));
  const bottom = height - AXIS_H;

  // Medal labels: the first, the peak and the latest get one, placed where they don't cover a
  // dot or another label (above-left of a rise, below-left of a drop, else to the right).
  const dots: Box[] = medals.map((m, i) => ({
    x0: x(m.t) - 7,
    y0: ys(steps[i]) - 7,
    x1: x(m.t) + 7,
    y1: ys(steps[i]) + 7,
  }));
  const peak = steps.length ? steps.indexOf(Math.max(...steps)) : -1;
  const wanted = medals.length
    ? [...new Set([medals.length - 1, peak, 0])].filter((i) => i >= 0)
    : [];
  const placed: Box[] = [];
  const labels = new Map<number, { x: number; y: number; anchor: "start" | "end" }>();
  for (const i of wanted) {
    const px = x(medals[i].t);
    const py = ys(steps[i]);
    const w = medals[i].label.length * CHAR_W;
    const rising = i === 0 || steps[i] >= steps[i - 1];
    const tries: { x: number; y: number; anchor: "start" | "end" }[] = [
      rising ? { x: px - 8, y: py - 9, anchor: "end" } : { x: px - 8, y: py + 17, anchor: "end" },
      { x: px + 8, y: py - 9, anchor: "start" },
      { x: px + 8, y: py + 17, anchor: "start" },
      { x: px - 8, y: py + 17, anchor: "end" },
    ];
    for (const c of tries) {
      const box: Box = {
        x0: c.anchor === "end" ? c.x - w : c.x,
        x1: c.anchor === "end" ? c.x : c.x + w,
        y0: c.y - 11,
        y1: c.y + 3,
      };
      if (box.x0 < PAD.left - 2 || box.x1 > right + 2) continue;
      if (box.y0 < medalTop - 4 || box.y1 > medalTop + medalH + 4) continue;
      if (dots.some((d, j) => j !== i && hits(box, d)) || placed.some((p) => hits(box, p)))
        continue;
      placed.push(box);
      labels.set(i, c);
      break;
    }
  }

  const point = (key: string, label: string, px: number, py: number) => ({
    tabIndex: 0,
    role: "button" as const,
    "aria-label": label,
    onMouseEnter: () => setActive({ key, label, x: px, y: py }),
    onMouseLeave: () => setActive(null),
    onFocus: () => setActive({ key, label, x: px, y: py }),
    onBlur: () => setActive(null),
    className: "cursor-pointer outline-none",
    "data-key": key,
  });

  const visibleBands = bands.filter((b) => b.lane === "medal" || showMmr);

  return (
    <div ref={ref} className="space-y-2">
      <p className="text-xs text-muted-foreground">{t("mmr.journey.hint")}</p>
      <div className="relative">
        <svg width={width} height={height} role="group" aria-label={ariaLabel} className="block">
          {visibleBands.map((b, i) => {
            const bx = x(b.from);
            const bw = Math.max(2, x(b.to) - bx);
            const top = b.lane === "medal" ? medalTop : mmrTop;
            return (
              <g key={i}>
                <rect
                  x={bx}
                  y={top}
                  width={bw}
                  height={b.lane === "medal" ? medalH : MMR_H}
                  rx={4}
                  className={b.tone === "win" ? "fill-win/[0.07]" : "fill-loss/[0.07]"}
                />
                <rect
                  x={bx}
                  y={top}
                  width={bw}
                  height={2}
                  className={b.tone === "win" ? "fill-win/60" : "fill-loss/60"}
                />
                {b.label && bw > b.label.length * 5.6 + 8 && (
                  <text
                    x={bx + 6}
                    y={top + 14}
                    className="pointer-events-none fill-muted-foreground text-[10px]"
                  >
                    {b.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* Medal lane */}
          <text
            x={PAD.left}
            y={medalTop - 10}
            className="fill-muted-foreground text-[10px] tracking-wider uppercase"
          >
            {t("mmr.journey.medalLane")}
          </text>
          {medalTicks.map((m) => (
            <g key={m.name}>
              <line
                x1={PAD.left}
                x2={right}
                y1={ys(m.step)}
                y2={ys(m.step)}
                className="stroke-white/[0.06]"
              />
              <text
                x={PAD.left - 10}
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
              strokeWidth={2}
              strokeLinejoin="round"
            />
          )}
          {medals.map((m, i) => {
            const label = t("mmr.journey.medalPoint", { medal: m.label, date: m.dateLabel });
            const px = x(m.t);
            const py = ys(steps[i]);
            const l = labels.get(i);
            const on = active?.key === `m${i}`;
            return (
              <g key={`m${m.t}`}>
                {l && (
                  <text
                    x={l.x}
                    y={l.y}
                    textAnchor={l.anchor}
                    className="pointer-events-none fill-foreground text-[11px] font-medium"
                  >
                    {m.label}
                  </text>
                )}
                <circle
                  cx={px}
                  cy={py}
                  r={12}
                  fill="transparent"
                  {...point(`m${i}`, label, px, py)}
                />
                <circle
                  cx={px}
                  cy={py}
                  r={on ? 6 : 4}
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
                y={mmrTop - 10}
                className="fill-muted-foreground text-[10px] tracking-wider uppercase"
              >
                {t("mmr.journey.mmrLane")}
              </text>
              {axis.ticks.map((v) => (
                <g key={v}>
                  <line
                    x1={PAD.left}
                    x2={right}
                    y1={ym(v)}
                    y2={ym(v)}
                    className="stroke-white/[0.06]"
                  />
                  <text
                    x={PAD.left - 10}
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
                const px = x(e.t);
                const py = ym(e.mmr);
                const on = active?.key === `e${i}`;
                return (
                  <g key={`e${i}`}>
                    <circle
                      cx={px}
                      cy={py}
                      r={10}
                      fill="transparent"
                      {...point(`e${i}`, label, px, py)}
                    />
                    <circle
                      cx={px}
                      cy={py}
                      r={on ? 5.5 : 3.5}
                      className="pointer-events-none fill-chart-4 stroke-card"
                      strokeWidth={2}
                    />
                  </g>
                );
              })}
            </g>
          )}

          {/* Crosshair for the point in focus */}
          {active && (
            <line
              x1={active.x}
              x2={active.x}
              y1={medalTop}
              y2={bottom}
              className="pointer-events-none stroke-white/20"
              strokeDasharray="2 3"
            />
          )}

          {/* Time axis */}
          <line x1={PAD.left} x2={right} y1={bottom} y2={bottom} className="stroke-white/[0.1]" />
          {ticks.map((tk, i) =>
            i % every === 0 ? (
              <text
                key={tk.t}
                x={x(tk.t)}
                y={bottom + 17}
                textAnchor="middle"
                className="fill-muted-foreground text-[10px]"
              >
                {tickLabel(tk, span)}
              </text>
            ) : null,
          )}
        </svg>
        {active && (
          <div
            role="status"
            className="pointer-events-none absolute z-10 rounded-md border border-white/10 bg-popover px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-foreground shadow-lg shadow-black/40"
            style={{
              left: Math.min(Math.max(active.x, 90), width - 90),
              top: active.y - 12,
              transform: "translate(-50%, -100%)",
            }}
          >
            {active.label}
          </div>
        )}
      </div>
    </div>
  );
}
