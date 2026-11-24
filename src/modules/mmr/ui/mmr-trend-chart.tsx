"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/common/i18n/client";
import { mmrTicks, tickLabel, timeTicks } from "@/common/charts/axes";

interface Point {
  t: number;
  mmr: number;
  label: string;
}

const HEIGHT = 240;
const PAD = { top: 12, right: 16, bottom: 28, left: 52 };
const DAY_MS = 86_400_000;

/**
 * Logged MMR over time. Dots are the user's actual entries; the dashed line between them is
 * only a connection, not a claim about what happened in between. Round MMR ticks, a date axis,
 * and a tooltip with a crosshair on hover or keyboard focus.
 */
export function MmrTrendChart({ points }: { points: Point[] }) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (points.length === 0) return null;
  // A little room either side so the first and last dots aren't on the frame.
  const first = points[0].t;
  const last = points.at(-1)!.t;
  const lead = Math.max(DAY_MS / 2, (last - first) * 0.03);
  const tMin = first - lead;
  const tMax = last + lead;
  const axis = mmrTicks(
    Math.min(...points.map((p) => p.mmr)),
    Math.max(...points.map((p) => p.mmr)),
  );
  const innerW = width - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const x = (v: number) => PAD.left + ((v - tMin) / (tMax - tMin)) * innerW;
  const y = (v: number) => PAD.top + ((axis.max - v) / (axis.max - axis.min)) * innerH;
  const line = points
    .map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.mmr).toFixed(1)}`)
    .join("");
  const ticks = timeTicks(tMin, tMax);
  const every = Math.max(1, Math.ceil(ticks.length / Math.max(1, Math.floor(innerW / 80))));
  const bottom = HEIGHT - PAD.bottom;
  const a = active !== null ? points[active] : null;

  return (
    <div ref={ref} className="space-y-2">
      <p className="text-xs text-muted-foreground">{t("mmr.trend.hint")}</p>
      <div className="relative">
        <svg
          width={width}
          height={HEIGHT}
          role="group"
          aria-label={t("mmr.trend.chart", { from: points[0].label, to: points.at(-1)!.label })}
          className="block"
        >
          {axis.ticks.map((v) => (
            <g key={v}>
              <line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={y(v)}
                y2={y(v)}
                className="stroke-white/[0.06]"
              />
              <text
                x={PAD.left - 10}
                y={y(v)}
                dy="0.32em"
                textAnchor="end"
                className="fill-muted-foreground text-[10px] tabular-nums"
              >
                {v.toLocaleString("en-US")}
              </text>
            </g>
          ))}
          <line
            x1={PAD.left}
            x2={width - PAD.right}
            y1={bottom}
            y2={bottom}
            className="stroke-white/[0.1]"
          />
          {ticks.map((tk, i) =>
            i % every === 0 ? (
              <text
                key={tk.t}
                x={x(tk.t)}
                y={bottom + 18}
                textAnchor="middle"
                className="fill-muted-foreground text-[10px]"
              >
                {tickLabel(tk, tMax - tMin)}
              </text>
            ) : null,
          )}
          {a && (
            <line
              x1={x(a.t)}
              x2={x(a.t)}
              y1={PAD.top}
              y2={bottom}
              className="pointer-events-none stroke-white/20"
              strokeDasharray="2 3"
            />
          )}
          {points.length > 1 && (
            <path
              d={line}
              fill="none"
              className="stroke-gold/70"
              strokeWidth={2}
              strokeDasharray="4 4"
              strokeLinejoin="round"
            />
          )}
          {points.map((p, i) => (
            <g key={i}>
              {/* Larger invisible hit target around each dot. */}
              <circle
                cx={x(p.t)}
                cy={y(p.mmr)}
                r={12}
                fill="transparent"
                tabIndex={0}
                role="button"
                aria-label={t("mmr.trend.dot", { mmr: p.mmr, label: p.label })}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                className="cursor-pointer outline-none"
              />
              <circle
                cx={x(p.t)}
                cy={y(p.mmr)}
                r={active === i ? 6 : 4}
                className="pointer-events-none fill-gold stroke-card"
                strokeWidth={2}
              />
            </g>
          ))}
        </svg>
        {a && (
          <div
            className="pointer-events-none absolute z-10 rounded-md border border-white/10 bg-popover px-2.5 py-1.5 text-xs whitespace-nowrap shadow-lg shadow-black/40"
            style={{
              left: Math.min(Math.max(x(a.t), 90), width - 90),
              top: y(a.mmr) - 12,
              transform: "translate(-50%, -100%)",
            }}
          >
            <span className="font-semibold text-foreground tabular-nums">
              {t("mmr.trend.value", { mmr: a.mmr.toLocaleString("en-US") })}
            </span>{" "}
            <span className="text-muted-foreground">· {a.label}</span>
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{t("mmr.trend.footnote")}</p>
    </div>
  );
}
