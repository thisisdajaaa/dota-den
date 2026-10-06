import { cn } from "cn";
import { getT } from "@/common/i18n/server";
import { signedMmr } from "../domain/session-labels";
import type { SessionMmr } from "../domain/session-mmr";

/**
 * Exact changes get a solid badge; estimates get "≈", a dashed border and the word
 * "estimate", so they can't be mistaken for real values (ADR 0007).
 */
export async function MmrChangeBadge({ mmr, className }: { mmr: SessionMmr; className?: string }) {
  const t = await getT();
  if (mmr.kind === "none") {
    return (
      <span className={cn("text-xs text-muted-foreground", className)}>
        {t("sessions.badge.none")}
      </span>
    );
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
        <span className="font-normal text-muted-foreground">{t("sessions.badge.exact")}</span>
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
      title={t("sessions.badge.estimateTitle", { n: mmr.perGame })}
    >
      ≈ {signedMmr(mmr.delta)} MMR
      <span className="font-normal text-muted-foreground">{t("sessions.badge.estimate")}</span>
    </span>
  );
}

/** Message keys for why a session's change is only an estimate. */
export const ESTIMATE_REASONS = {
  no_entries: "sessions.reasons.no_entries",
  not_bracketed: "sessions.reasons.not_bracketed",
  other_games_between: "sessions.reasons.other_games_between",
} as const satisfies Record<Extract<SessionMmr, { kind: "estimate" }>["reason"], string>;
