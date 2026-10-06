import type { HeroInfo } from "@/modules/matches/application/ports";
import { formatAgo, formatPercent, plural } from "@/modules/matches/ui/format";
import { HeroPortrait, heroName } from "@/modules/matches/ui/hero-portrait";
import { WinRateBar } from "@/modules/matches/ui/win-rate-bar";
import type { DuosView } from "../dtos/responses/meta.dto";
import { POSITION_INFO, type Position } from "../domain/position";
import { MetaSection, Unavailable } from "./meta-section";

export function LaneDuosCard({
  position,
  view,
  catalog,
  now,
}: {
  position: Position;
  view: DuosView;
  catalog: Map<number, HeroInfo>;
  now: Date;
}) {
  const info = POSITION_INFO[position];
  const id = "meta-lane-duos";
  if (view.result.kind === "solo_lane") {
    return (
      <MetaSection id={id} kicker="Lane partners" title="Strongest lane duos">
        <p className="border-t border-white/[0.06] px-5 py-6 text-sm text-muted-foreground">
          Mid is a solo lane, so there are no lane duos to show.
        </p>
      </MetaSection>
    );
  }
  const { duos } = view.result;
  return (
    <MetaSection
      id={id}
      kicker="Lane partners"
      title="Strongest lane duos"
      description={`Two heroes from the same team sharing the ${info.laneName}, in pro matches over the last ${view.windowDays} days. Pairs with fewer than 8 games are left out.`}
      footer={
        view.fetchedAt
          ? `Source: OpenDota pro match database, updated ${formatAgo(view.fetchedAt, now)}.`
          : undefined
      }
    >
      {duos.length === 0 ? (
        <Unavailable>No {info.laneName} pair has enough pro games yet.</Unavailable>
      ) : (
        <ol className="divide-y divide-white/[0.04] border-t border-white/[0.06]">
          {duos.map((d) => {
            const a = catalog.get(d.heroA);
            const b = catalog.get(d.heroB);
            return (
              <li key={`${d.heroA}-${d.heroB}`} className="flex items-center gap-3 px-5 py-2.5">
                <span className="flex shrink-0 -space-x-2">
                  <HeroPortrait hero={a} heroId={d.heroA} size="sm" />
                  <HeroPortrait hero={b} heroId={d.heroB} size="sm" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {heroName(a, d.heroA)} + {heroName(b, d.heroB)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatPercent(d.rate)} win rate · {plural(d.games, "game")}
                  </p>
                </div>
                <span className="hidden w-20 sm:block">
                  <WinRateBar rate={d.rate} />
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </MetaSection>
  );
}
