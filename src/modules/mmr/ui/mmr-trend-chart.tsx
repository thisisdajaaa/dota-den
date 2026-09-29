"use client";

import { useEffect, useRef, useState } from "react";

interface Point {
  t: number;
  mmr: number;
  label: string;
}

const HEIGHT = 200;
const PAD = { top: 16, right: 16, bottom: 26, left: 48 };

/**
 * Logged MMR over time. Dots are the user's actual entries; the dashed line between them is
 * only a connection, not a claim about what happened in between.
 */
export function MmrTrendChart({ points }: { points: Point[] }) {
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
  const tMin = points[0].t;
  const tMax = points.at(-1)!.t;
  const lo = Math.min(...points.map((p) => p.mmr));
  const hi = Math.max(...points.map((p) => p.mmr));
  const pad = Math.max(25, Math.round((hi - lo) * 0.15));
  const yMin = Math.floor((lo - pad) / 25) * 25;
  const yMax = Math.ceil((hi + pad) / 25) * 25;
  const innerW = width - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const x = (t: number) =>
    PAD.left + (tMax === tMin ? innerW / 2 : ((t - tMin) / (tMax - tMin)) * innerW);
  const y = (v: number) => PAD.top + ((yMax - v) / (yMax - yMin)) * innerH;
  const ticks = [yMin, Math.round((yMin + yMax) / 2 / 25) * 25, yMax];
  const line = points
    .map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.mmr).toFixed(1)}`)
    .join("");
  const a = active !== null ? points[active] : null;

  return (
    <div ref={ref} className="space-y-2">
      <p className="h-4 text-xs text-muted-foreground" aria-live="polite">
        {a ? (
          <>
            <span className="font-semibold text-foreground">
              {a.mmr.toLocaleString("en-US")} MMR
            </span>{" "}
            · {a.label}
          </>
        ) : (
          "Hover or tab through the dots to see each entry."
        )}
      </p>
      <svg
        width={width}
        height={HEIGHT}
        role="img"
        aria-label={`Logged MMR from ${points[0].label} to ${points.at(-1)!.label}`}
        className="block"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={y(t)}
              y2={y(t)}
              className="stroke-white/[0.06]"
            />
            <text
              x={PAD.left - 8}
              y={y(t)}
              dy="0.32em"
              textAnchor="end"
              className="fill-muted-foreground text-[10px] tabular-nums"
            >
              {t.toLocaleString("en-US")}
            </text>
          </g>
        ))}
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
              aria-label={`${p.mmr} MMR, ${p.label}`}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              className="cursor-pointer outline-none"
            />
            <circle
              cx={x(p.t)}
              cy={y(p.mmr)}
              r={active === i ? 6 : 4.5}
              className="pointer-events-none fill-gold stroke-card"
              strokeWidth={2}
            />
          </g>
        ))}
      </svg>
      <p className="text-xs text-muted-foreground">
        Dots are your logged entries. The dashed line just connects them; your MMR between entries
        isn&apos;t known.
      </p>
    </div>
  );
}
