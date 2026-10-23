import { cn } from "cn";

/** Values longer than this (in characters) are set smaller so they don't fill the tile. */
const LONG_VALUE = 16;

/**
 * A single headline number with its denominator; the number is the chart.
 *
 * Inside a grid, each tile spans three rows of that grid (label, value, footer) through
 * `subgrid`, so the tiles in one row line up: a label that wraps to two lines pushes every
 * value in the row down together instead of only its own, and all tiles share one height.
 * Anything else placed in the same grid should span three rows too (`row-span-3`).
 */
export function StatTile({
  label,
  value,
  detail,
  meter,
  tone,
  className,
}: {
  label: string;
  value: string;
  detail?: React.ReactNode;
  /** Optional 0–1 fill for a thin progress meter under the value. */
  meter?: number | null;
  tone?: "win" | "loss" | "gold" | "muted";
  className?: string;
}) {
  const meterColor =
    tone === "win"
      ? "bg-win"
      : tone === "loss"
        ? "bg-loss"
        : tone === "muted"
          ? "bg-unknown"
          : "bg-gold";
  const hasMeter = meter !== undefined && meter !== null;
  return (
    <div
      data-slot="stat-tile"
      className={cn(
        "panel row-span-3 grid min-w-0 grid-rows-subgrid content-start gap-1 p-4",
        className,
      )}
    >
      {/* Long single words (Filipino labels in narrow tiles) break rather than spill. */}
      <span className="kicker self-start [overflow-wrap:anywhere] hyphens-auto">{label}</span>
      <span
        className={cn(
          "font-semibold tracking-tight [overflow-wrap:anywhere] tabular-nums",
          // A sentence for a value ("Too few games to judge") reads as text, not a headline.
          value.length > LONG_VALUE ? "text-xl leading-snug" : "text-3xl",
        )}
      >
        {value}
      </span>
      <span className="flex min-w-0 flex-col gap-1 self-start empty:hidden">
        {hasMeter && (
          <span
            className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/[0.06]"
            aria-hidden
          >
            <span
              className={cn("block h-full rounded-full", meterColor)}
              style={{ width: `${Math.max(0, Math.min(1, meter)) * 100}%` }}
            />
          </span>
        )}
        {detail && <span className="text-xs text-muted-foreground">{detail}</span>}
      </span>
    </div>
  );
}
