import { cn } from "cn";

/** A single headline number with its denominator; the number is the chart. */
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
  return (
    <div className={cn("panel flex flex-col gap-1 p-4", className)}>
      <span className="kicker">{label}</span>
      <span className="text-3xl font-semibold tracking-tight">{value}</span>
      {meter !== undefined && meter !== null && (
        <span className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/[0.06]" aria-hidden>
          <span
            className={cn("block h-full rounded-full", meterColor)}
            style={{ width: `${Math.max(0, Math.min(1, meter)) * 100}%` }}
          />
        </span>
      )}
      {detail && <span className="text-xs text-muted-foreground">{detail}</span>}
    </div>
  );
}
