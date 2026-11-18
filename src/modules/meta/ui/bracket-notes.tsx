import { getT } from "@/common/i18n/server";
import { plural } from "@/common/i18n/translate";
import { formatAgo } from "@/modules/matches/ui/format";
import type { BracketView } from "../dtos/responses/meta.dto";
import type { PositionStats } from "../domain/position-stats";
import { BRACKET_MEDALS, bracketLabel, MEDAL_NAMES } from "../domain/rank-bracket";
import { Unavailable } from "./meta-section";
import { formatDayRange, StratzAttribution } from "./stratz-attribution";

/**
 * Where a bracket ranking's numbers come from: the bracket's win rates (OpenDota, with the
 * sample size), what placed heroes at positions (and which games that was), and what's left out.
 */
export async function BracketSourceNote({
  view,
  window,
  now,
  trendFetchedAt,
}: {
  view: BracketView;
  /** The STRATZ window, when STRATZ placed the heroes. */
  window: PositionStats["window"] | null;
  now: Date;
  /** OpenDota hero stats (pick trends); omitted where trends aren't shown. */
  trendFetchedAt?: Date | null;
}) {
  const t = await getT();
  const name = bracketLabel(view.bracket);
  return (
    <>
      {t("meta.bracketSource.rates", {
        bracket: name,
        matches: plural(t, "meta.counts.matches", view.matches),
        ago: formatAgo(view.fetchedAt, now),
      })}{" "}
      {view.placedBy === "positions" && window
        ? t("meta.bracketSource.placedPositions", { range: formatDayRange(window) })
        : t("meta.bracketSource.placedLanes")}{" "}
      {trendFetchedAt !== undefined && trendFetchedAt !== null && (
        <>{t("meta.bracketSource.trends")} </>
      )}
      {t("meta.bracketSource.noPro")}
      {view.placedBy === "positions" && window && (
        <>
          {" "}
          <StratzAttribution t={t} />
        </>
      )}
    </>
  );
}

/** Says when a medal of the bracket has no games in the data, so the label isn't overstated. */
export async function EmptyMedalsNote({ view }: { view: BracketView }) {
  if (view.emptyMedals.length === 0) return null;
  const t = await getT();
  const empty = new Set(view.emptyMedals);
  const names = (ms: readonly number[]) =>
    ms.map((m) => MEDAL_NAMES[m as keyof typeof MEDAL_NAMES]).join(", ");
  return (
    <Unavailable>
      {t("meta.bracketSource.emptyMedals", {
        empty: names(view.emptyMedals),
        rest: names(BRACKET_MEDALS[view.bracket].filter((m) => !empty.has(m))),
      })}
    </Unavailable>
  );
}
