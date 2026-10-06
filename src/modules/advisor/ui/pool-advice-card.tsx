import Link from "next/link";
import { getT } from "@/common/i18n/server";
import { plural } from "@/common/i18n/translate";
import type { HeroInfo } from "@/modules/matches/domain/read-models";
import { formatPercent } from "@/modules/matches/ui/format";
import { HeroPortrait, heroName } from "@/modules/matches/ui/hero-portrait";
import { POSITION_INFO } from "@/modules/meta/domain/position";
import { MetaSection, Unavailable } from "@/modules/meta/ui/meta-section";
import type { PoolAdviceView } from "../dtos/responses/pool-advice.dto";

const MIN_CONTEST = 0.15;

/** "Heroes to add": suggestions for your role, each with the numbers behind it. */
export async function PoolAdviceCard({
  view,
  heroes,
}: {
  view: PoolAdviceView;
  heroes: Map<number, HeroInfo>;
}) {
  const t = await getT();
  const name = (id: number) => heroName(heroes.get(id), id);
  if (view.status !== "ok") {
    return (
      <MetaSection id="pool-advice" kicker={t("advisor.kicker")} title={t("advisor.title")}>
        <Unavailable>
          {view.status === "no_role" ? t("advisor.noRole") : t("advisor.unavailable")}
        </Unavailable>
      </MetaSection>
    );
  }
  const pos = POSITION_INFO[view.position];
  return (
    <MetaSection
      id="pool-advice"
      kicker={t("advisor.kickerRole", { short: pos.short, name: pos.name })}
      title={t("advisor.title")}
      description={
        view.nemeses.length > 0 ? (
          <>
            {t("advisor.descNemeses")}{" "}
            {view.nemeses.map((n, i) => (
              <span key={n.heroId}>
                {i > 0 && ", "}
                <span className="text-foreground">{name(n.heroId)}</span>
              </span>
            ))}
            .
          </>
        ) : (
          t("advisor.descPlain")
        )
      }
      footer={t("advisor.footer", { days: view.windowDays })}
    >
      {view.advice.length === 0 ? (
        <Unavailable>{t("advisor.none")}</Unavailable>
      ) : (
        <ul className="divide-y divide-white/[0.05] border-t border-white/[0.06]">
          {view.advice.map((a) => (
            <li key={a.heroId}>
              <Link
                href={`/guides/${a.heroId}`}
                className="group flex gap-3 px-5 py-3 hover:bg-white/[0.03]"
              >
                <HeroPortrait hero={heroes.get(a.heroId)} heroId={a.heroId} size="md" />
                <span className="min-w-0 flex-1 space-y-0.5">
                  <span className="block font-medium group-hover:text-gold">{name(a.heroId)}</span>
                  <ul className="space-y-0.5 text-xs text-muted-foreground">
                    {a.counters.slice(0, 2).map((c) => (
                      <li key={c.nemesisId}>
                        {t("advisor.beats")}{" "}
                        <span className="text-foreground">{name(c.nemesisId)}</span>:{" "}
                        {t("advisor.beatsDetail", {
                          rate: formatPercent(c.winRate),
                          games: plural(t, "advisor.counts.proGames", c.games),
                          hero: name(c.nemesisId),
                          lossRate: formatPercent(c.yourLossRate),
                        })}
                      </li>
                    ))}
                    {a.highRank && (
                      <li>
                        {t("advisor.highRank", {
                          rate: formatPercent(a.highRank.rate),
                          games: plural(t, "advisor.counts.games", a.highRank.games),
                        })}
                      </li>
                    )}
                    {a.contestRate !== null && a.contestRate >= MIN_CONTEST && (
                      <li>{t("advisor.contest", { rate: formatPercent(a.contestRate) })}</li>
                    )}
                    {a.yourGames > 0 && <li>{plural(t, "advisor.played", a.yourGames)}</li>}
                  </ul>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </MetaSection>
  );
}
