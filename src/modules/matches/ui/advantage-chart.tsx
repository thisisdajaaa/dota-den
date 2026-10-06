"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "cn";
import { useT } from "@/common/i18n/client";

type Series = "gold" | "xp";

const HEIGHT = 220;
const PAD = { top: 16, right: 12, bottom: 24, left: 44 };

function nice(v: number): number {
  const step = v > 20_000 ? 10_000 : v > 8_000 ? 5_000 : 2_000;
  return Math.ceil(v / step) * step;
}

/**
 * Domain always includes zero. Each side is sized to its data (with a floor of 25% of
 * the other side), so a one-sided game doesn't waste half the plot.
 */
function domain(values: number[]): { top: number; bottom: number } {
  const hi = Math.max(0, ...values);
  const lo = Math.max(0, ...values.map((v) => -v));
  const top = nice(Math.max(2_000, hi, lo * 0.25));
  const bottom = nice(Math.max(2_000, lo, hi * 0.25));
  return { top, bottom };
}

function formatK(v: number): string {
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  const abs = Math.abs(v);
  return `${sign}${abs >= 1_000 ? `${(abs / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k` : abs}`;
}

/**
 * Radiant advantage per minute (one series, one axis). Above zero = Radiant ahead,
 * below = Dire ahead; the regions are labelled in text, not by color alone.
 */
export function AdvantageChart({ gold, xp }: { gold: number[]; xp: number[] | null }) {
  const t = useT();
  const [series, setSeries] = useState<Series>("gold");
  const [width, setWidth] = useState(720);
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const clipId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(280, entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const data = series === "gold" || !xp ? gold : xp;
  const { top, bottom } = domain(data);
  const innerW = width - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (i / Math.max(1, data.length - 1)) * innerW;
  const y = (v: number) => PAD.top + ((top - v) / (top + bottom)) * innerH;
  const zeroY = y(0);

  const line = data
    .map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join("");
  const area = `${line}L${x(data.length - 1)},${zeroY}L${x(0)},${zeroY}Z`;
  const ticksY = [top, top / 2, 0, -bottom / 2, -bottom].filter(
    (t, i, all) => all.indexOf(t) === i && (t === 0 || Math.abs(y(t) - zeroY) > 28),
  );
  const ticksX = data.map((_, i) => i).filter((i) => i % 10 === 0);

  const indexFromEvent = (clientX: number, rect: DOMRect) => {
    const rel = (clientX - rect.left - PAD.left) / innerW;
    return Math.round(Math.max(0, Math.min(1, rel)) * (data.length - 1));
  };

  const active = hover ?? null;
  const activeValue = active !== null ? data[active] : null;
  const sideName = (v: number) => (v > 0 ? t("matches.sides.radiant") : t("matches.sides.dire"));

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label={t("matches.advantage.seriesLabel")}
          className="inline-flex rounded-lg border border-white/[0.07] bg-background/40 p-0.5"
        >
          {(["gold", "xp"] as const).map((s) => (
            <button
              key={s}
              role="tab"
              aria-selected={series === s}
              disabled={s === "xp" && !xp}
              onClick={() => setSeries(s)}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors disabled:opacity-40",
                series === s
                  ? "bg-gold/15 text-gold"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s === "gold" ? t("matches.advantage.netWorth") : t("matches.advantage.experience")}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
          {active !== null && activeValue !== null ? (
            <>
              <span className="text-foreground">{active}:00</span> ·{" "}
              {activeValue === 0
                ? t("matches.advantage.even")
                : t(`matches.advantage.${series}.lead`, {
                    side: sideName(activeValue),
                    value: formatK(Math.abs(activeValue)),
                  })}
            </>
          ) : (
            <>
              {t("matches.advantage.final", {
                side: data.at(-1)! >= 0 ? t("matches.sides.radiant") : t("matches.sides.dire"),
                value: formatK(Math.abs(data.at(-1)!)),
              })}
            </>
          )}
        </p>
      </div>

      <div ref={ref} className="w-full min-w-0 overflow-hidden">
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={t(`matches.advantage.${series}.chart`)}
          tabIndex={0}
          // Never wider than its box, even before the first measurement.
          style={{ maxWidth: "100%" }}
          className="block touch-none rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          onPointerMove={(e) =>
            setHover(indexFromEvent(e.clientX, e.currentTarget.getBoundingClientRect()))
          }
          onPointerLeave={() => setHover(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") setHover((h) => Math.min(data.length - 1, (h ?? -1) + 1));
            else if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? data.length) - 1));
            else if (e.key === "Escape") setHover(null);
            else return;
            e.preventDefault();
          }}
        >
          <defs>
            <clipPath id={`${clipId}-above`}>
              <rect x={0} y={0} width={width} height={zeroY} />
            </clipPath>
            <clipPath id={`${clipId}-below`}>
              <rect x={0} y={zeroY} width={width} height={HEIGHT - zeroY} />
            </clipPath>
          </defs>

          {ticksY.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={y(t)}
                y2={y(t)}
                className={t === 0 ? "stroke-foreground/30" : "stroke-white/[0.05]"}
                strokeWidth={1}
              />
              <text
                x={PAD.left - 8}
                y={y(t)}
                dy="0.32em"
                textAnchor="end"
                className="fill-muted-foreground text-[10px] tabular-nums"
              >
                {formatK(t)}
              </text>
            </g>
          ))}
          {ticksX.map((i) => (
            <text
              key={i}
              x={x(i)}
              y={HEIGHT - 6}
              textAnchor="middle"
              className="fill-muted-foreground text-[10px] tabular-nums"
            >
              {t("matches.advantage.minuteTick", { n: i })}
            </text>
          ))}

          <text
            x={PAD.left + 8}
            y={PAD.top + 10}
            className="fill-muted-foreground text-[10px] tracking-wider uppercase"
          >
            {t("matches.advantage.radiantAhead")}
          </text>
          <text
            x={PAD.left + 8}
            y={HEIGHT - PAD.bottom - 6}
            className="fill-muted-foreground text-[10px] tracking-wider uppercase"
          >
            {t("matches.advantage.direAhead")}
          </text>

          <path d={area} clipPath={`url(#${clipId}-above)`} className="fill-win/20" />
          <path d={area} clipPath={`url(#${clipId}-below)`} className="fill-loss/20" />
          <path
            d={line}
            fill="none"
            className="stroke-foreground/80"
            strokeWidth={2}
            strokeLinejoin="round"
          />

          {active !== null && activeValue !== null && (
            <g pointerEvents="none">
              <line
                x1={x(active)}
                x2={x(active)}
                y1={PAD.top}
                y2={HEIGHT - PAD.bottom}
                className="stroke-foreground/30"
              />
              <circle
                cx={x(active)}
                cy={y(activeValue)}
                r={4.5}
                className={cn(activeValue >= 0 ? "fill-win" : "fill-loss", "stroke-card")}
                strokeWidth={2}
              />
            </g>
          )}
        </svg>
      </div>

      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none hover:text-foreground">
          {t("matches.advantage.viewTable")}
        </summary>
        <div className="mt-2 max-h-48 overflow-auto">
          <table className="w-full max-w-xs tabular-nums">
            <thead>
              <tr className="text-left">
                <th scope="col" className="font-medium">
                  {t("matches.advantage.minute")}
                </th>
                <th scope="col" className="text-right font-medium">
                  {t(`matches.advantage.${series}.column`)}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((v, i) => (
                <tr key={i}>
                  <td>{i}</td>
                  <td className="text-right">{v.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
