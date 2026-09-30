import { formatPercent, plural } from "@/modules/matches/ui/format";
import type { BaselineComparison, WinRecord } from "../domain/together-stats";

/** Signed percentage-point difference, e.g. "+6.2%" or "−3.0%". */
export function formatDelta(delta: number): string {
  const pts = (Math.abs(delta) * 100).toFixed(1);
  if (pts === "0.0") return "±0.0%";
  return `${delta > 0 ? "+" : "−"}${pts}%`;
}

/** Plain-language headline and explanation for the baseline comparison. */
export function comparisonCopy(
  c: BaselineComparison,
  baseline: WinRecord | null,
): { value: string; detail: string; tone: "win" | "loss" | "muted" } {
  switch (c.kind) {
    case "compared":
      return {
        value: `${formatDelta(c.delta)} vs your usual`,
        detail: `Your usual: ${formatPercent(c.baselineRate)} across ${plural(baseline?.games ?? 0, "other game")} in the same period.`,
        tone: c.delta >= 0 ? "win" : "loss",
      };
    case "too_few_together":
      return {
        value: "Too few games together to judge",
        detail: `A comparison needs at least ${c.needed} confirmed party games; you have ${c.games}.`,
        tone: "muted",
      };
    case "no_baseline":
      return {
        value: "No baseline yet",
        detail:
          c.games === 0
            ? "Sync your matches on the Overview page to compare with your usual win rate."
            : `Only ${plural(c.games, "other game")} of yours in the same period; a baseline needs ${c.needed}.`,
        tone: "muted",
      };
  }
}

export const CAVEAT =
  "Other things differ too: roles, heroes, opponents. A gap here is a hint, not proof that playing together is the reason.";
