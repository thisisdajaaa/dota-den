import type { HeroInfo } from "@/modules/matches/domain/read-models";
import { getT } from "@/common/i18n/server";
import { plural } from "@/common/i18n/translate";
import { formatAgo, formatPercent } from "@/modules/matches/ui/format";
import { HeroPortrait, heroName } from "@/modules/matches/ui/hero-portrait";
import { WinRateBar } from "@/modules/matches/ui/win-rate-bar";
import type { DuosView } from "../dtos/responses/meta.dto";
import { POSITION_INFO, type Position } from "../domain/position";
import { MetaSection, Unavailable } from "./meta-section";

export async function LaneDuosCard({
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
  const t = await getT();
  const info = POSITION_INFO[position];
  const id = "meta-lane-duos";
  if (view.result.kind === "solo_lane") {
    return (
      <MetaSection id={id} kicker={t("meta.duos.kicker")} title={t("meta.duos.title")}>
        <p className="border-t border-white/[0.06] px-5 py-6 text-sm text-muted-foreground">
          {t("meta.duos.soloLane")}
        </p>
      </MetaSection>
    );
  }
  const { duos } = view.result;
  return (
    <MetaSection
      id={id}
      kicker={t("meta.duos.kicker")}
      title={t("meta.duos.title")}
      description={t("meta.duos.description", {
        lane: info.laneName,
        days: String(view.windowDays),
      })}
      footer={
        view.fetchedAt ? t("meta.duos.source", { ago: formatAgo(view.fetchedAt, now) }) : undefined
      }
    >
      {duos.length === 0 ? (
        <Unavailable>{t("meta.duos.empty", { lane: info.laneName })}</Unavailable>
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
                    {t("meta.duos.rate", {
                      rate: formatPercent(d.rate),
                      games: plural(t, "meta.counts.games", d.games),
                    })}
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
