import { cn } from "cn";

/**
 * Thin win-rate meter on a 0–100% scale with a 50% reference tick.
 * Identity is carried by the adjacent text label, never by color alone.
 */
export function WinRateBar({
  rate,
  muted,
  className,
}: {
  rate: number | null;
  muted?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative block h-2 w-full overflow-hidden rounded-full bg-white/[0.06]",
        className,
      )}
    >
      {rate !== null && (
        <span
          className={cn(
            "absolute inset-y-0 left-0 rounded-full",
            muted ? "bg-unknown/60" : rate >= 0.5 ? "bg-win" : "bg-loss",
          )}
          style={{ width: `${rate * 100}%` }}
        />
      )}
      <span className="absolute inset-y-0 left-1/2 w-px bg-foreground/40" />
    </span>
  );
}
