import { cn } from "cn";
import { signedMmr } from "../domain/session-labels";
import type { SessionMmr } from "../domain/session-mmr";

/**
 * Exact changes get a solid badge; estimates get "≈", a dashed border and the word
 * "estimate", so they can't be mistaken for real values (ADR 0007).
 */
export function MmrChangeBadge({ mmr, className }: { mmr: SessionMmr; className?: string }) {
  if (mmr.kind === "none") {
    return <span className={cn("text-xs text-muted-foreground", className)}>No ranked games</span>;
  }
  const tone = mmr.delta > 0 ? "text-win" : mmr.delta < 0 ? "text-loss" : "text-muted-foreground";
  if (mmr.kind === "exact") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-xs font-semibold tabular-nums",
          tone,
          className,
        )}
      >
        {signedMmr(mmr.delta)} MMR
        <span className="font-normal text-muted-foreground">exact</span>
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-dashed border-white/20 px-2 py-0.5 text-xs font-semibold tabular-nums",
        tone,
        className,
      )}
      title={`Estimate: ±${mmr.perGame} per ranked game, not your real MMR change`}
    >
      ≈ {signedMmr(mmr.delta)} MMR
      <span className="font-normal text-muted-foreground">estimate</span>
    </span>
  );
}

export const ESTIMATE_REASONS: Record<Extract<SessionMmr, { kind: "estimate" }>["reason"], string> =
  {
    no_entries: "You haven't logged any MMR yet.",
    not_bracketed: "Log your MMR right before and right after a session to get the exact change.",
    other_games_between:
      "Other ranked games were played between your MMR entries, so the change can't be pinned on this session alone.",
  };
