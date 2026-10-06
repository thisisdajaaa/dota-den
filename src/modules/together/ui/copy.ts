import type { Messages } from "@/common/i18n/messages";
import { plural, type Translator } from "@/common/i18n/translate";
import { formatPercent } from "@/modules/matches/ui/format";
import type { BaselineComparison, WinRecord } from "../domain/together-stats";

/** Signed percentage-point difference, e.g. "+6.2%" or "−3.0%". */
export function formatDelta(delta: number): string {
  const pts = (Math.abs(delta) * 100).toFixed(1);
  if (pts === "0.0") return "±0.0%";
  return `${delta > 0 ? "+" : "−"}${pts}%`;
}

/** Plain-language headline and explanation for the baseline comparison. */
export function comparisonCopy(
  t: Translator<Messages>,
  c: BaselineComparison,
  baseline: WinRecord | null,
): { value: string; detail: string; tone: "win" | "loss" | "muted" } {
  switch (c.kind) {
    case "compared":
      return {
        value: t("together.comparison.vsUsual", { delta: formatDelta(c.delta) }),
        detail: t("together.comparison.usualDetail", {
          rate: formatPercent(c.baselineRate),
          games: plural(t, "together.units.otherGame", baseline?.games ?? 0),
        }),
        tone: c.delta >= 0 ? "win" : "loss",
      };
    case "too_few_together":
      return {
        value: t("together.comparison.tooFewValue"),
        detail: t("together.comparison.tooFewDetail", { needed: c.needed, games: c.games }),
        tone: "muted",
      };
    case "no_baseline":
      return {
        value: t("together.comparison.noBaselineValue"),
        detail:
          c.games === 0
            ? t("together.comparison.noBaselineSync")
            : t("together.comparison.noBaselineFew", {
                games: plural(t, "together.units.otherGame", c.games),
                needed: c.needed,
              }),
        tone: "muted",
      };
  }
}
