import Link from "next/link";
import { cn } from "cn";
import { getT } from "@/common/i18n/server";
import { plural } from "@/common/i18n/translate";
import type { HeroInfo } from "@/modules/matches/domain/read-models";
import { HeroPortrait, heroName } from "@/modules/matches/ui/hero-portrait";
import type { CompareStat, RankBracket, StatGap } from "../domain/compare";
import type { CompareView } from "../dtos/responses/compare.dto";

const value = (stat: CompareStat, v: number) =>
  stat === "lastHits" ? Math.round(v) : v.toFixed(1);

/** One stat as a bar centred on the rank's average: right of centre is better. */
function GapBar({ gap }: { gap: StatGap }) {
  // Better is always drawn to the right, whatever the stat (fewer deaths is better).
  const signed = gap.stat === "deaths" ? -gap.diffPct : gap.diffPct;
  const width = Math.min(50, Math.abs(signed) / 2);
  return (
    <span aria-hidden className="relative block h-1.5 w-full rounded-full bg-white/[0.06]">
      <span className="absolute top-0 left-1/2 h-full w-px bg-white/30" />
      <span
        className={cn(
          "absolute top-0 h-full rounded-full",
          signed >= 0 ? "bg-win/80" : "bg-loss/80",
        )}
        style={
          signed >= 0 ? { left: "50%", width: `${width}%` } : { right: "50%", width: `${width}%` }
        }
      />
    </span>
  );
}

/** How you compare: each hero's stats against players at a rank, at the same game length. */
export async function CompareSections({
  view,
  heroes,
}: {
  view: CompareView;
  heroes: Map<number, HeroInfo>;
}) {
  const t = await getT();
  const rank = (b: RankBracket | null) => (b ? t(`heroes.compare.brackets.${b}`) : "");
  const name = (id: number) => heroName(heroes.get(id), id);
  const gapText = (heroId: number, g: StatGap) =>
    t(`heroes.compare.gap.${g.stat}.${g.better ? "better" : "worse"}`, {
      hero: name(heroId),
      pct: Math.abs(g.diffPct),
      rank: rank(view.bracket),
    });

  if (view.status !== "ok")
    return (
      <p role="status" className="panel p-5 text-sm text-muted-foreground">
        {t(`heroes.compare.status.${view.status}`)}
      </p>
    );

  return (
    <div className="space-y-5">
      {view.fromImported && (
        <p role="status" className="panel border-gold/30 p-4 text-sm text-muted-foreground">
          {t("heroes.compare.fromImported")}
        </p>
      )}
      {(view.weakest || view.strongest) && (
        <section aria-label={t("heroes.compare.summary")} className="grid gap-3 sm:grid-cols-2">
          {view.weakest && (
            <div className="panel space-y-1 border-loss/30 p-4">
              <p className="kicker text-loss">{t("heroes.compare.workOn")}</p>
              <p className="font-medium">{gapText(view.weakest.heroId, view.weakest.stat)}</p>
              <p className="text-xs text-muted-foreground">
                {t("heroes.compare.numbers", {
                  yours: value(view.weakest.stat.stat, view.weakest.stat.yours),
                  theirs: value(view.weakest.stat.stat, view.weakest.stat.theirs),
                })}
              </p>
            </div>
          )}
          {view.strongest && (
            <div className="panel space-y-1 border-win/30 p-4">
              <p className="kicker text-win">{t("heroes.compare.strength")}</p>
              <p className="font-medium">{gapText(view.strongest.heroId, view.strongest.stat)}</p>
              <p className="text-xs text-muted-foreground">
                {t("heroes.compare.numbers", {
                  yours: value(view.strongest.stat.stat, view.strongest.stat.yours),
                  theirs: value(view.strongest.stat.stat, view.strongest.stat.theirs),
                })}
              </p>
            </div>
          )}
        </section>
      )}

      <section aria-labelledby="compare-heroes" className="panel overflow-hidden">
        <h2 id="compare-heroes" className="px-5 pt-5 pb-3 text-lg font-semibold">
          {t("heroes.compare.heroesTitle", { rank: rank(view.bracket) })}
        </h2>
        <ul className="divide-y divide-white/[0.05] border-t border-white/[0.06]">
          {view.heroes.map((h) => (
            <li key={h.heroId} className="grid gap-3 px-5 py-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
              <Link
                href={`/heroes/${h.heroId}`}
                className="flex items-center gap-3 hover:text-gold"
              >
                <HeroPortrait hero={heroes.get(h.heroId)} heroId={h.heroId} size="md" />
                <span>
                  <span className="block font-medium">{name(h.heroId)}</span>
                  <span className="text-xs text-muted-foreground">
                    {plural(t, "heroes.compare.games", h.games)}
                  </span>
                </span>
              </Link>
              <dl className="grid gap-2 sm:grid-cols-3">
                {h.stats.map((g) => (
                  <div key={g.stat} className="space-y-1">
                    <dt className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
                      <span>{t(`heroes.compare.stats.${g.stat}`)}</span>
                      <span
                        className={cn(
                          "font-semibold tabular-nums",
                          g.better ? "text-win" : "text-loss",
                        )}
                      >
                        {g.diffPct > 0 ? "+" : ""}
                        {g.diffPct}%
                      </span>
                    </dt>
                    <dd className="space-y-1">
                      <GapBar gap={g} />
                      <span className="block text-[0.7rem] text-muted-foreground tabular-nums">
                        {t("heroes.compare.numbers", {
                          yours: value(g.stat, g.yours),
                          theirs: value(g.stat, g.theirs),
                        })}
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
        {view.locked > 0 && (
          <p className="border-t border-gold/30 bg-gold/5 px-5 py-3 text-sm">
            {plural(t, "heroes.compare.locked", view.locked)}{" "}
            <Link href="/plus" className="font-medium text-gold hover:underline">
              {t("heroes.compare.seePlus")}
            </Link>
          </p>
        )}
      </section>
      <p className="text-xs text-muted-foreground">
        {t("heroes.compare.method", { days: view.windowDays })}
      </p>
    </div>
  );
}

/** The overview's short version: your biggest gap and edge against your rank, with a link. */
export async function CompareTeaser({
  view,
  heroes,
}: {
  view: CompareView;
  heroes: Map<number, HeroInfo>;
}) {
  const t = await getT();
  const rows = [
    view.weakest && { kind: "weak" as const, ...view.weakest },
    view.strongest && { kind: "strong" as const, ...view.strongest },
  ].filter((r) => r !== null);
  if (view.status !== "ok" || rows.length === 0) return null;
  const rank = view.bracket ? t(`heroes.compare.brackets.${view.bracket}`) : "";
  return (
    <section aria-labelledby="compare-teaser" className="panel space-y-4 p-5">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="kicker">{t("heroes.compare.teaser.kicker")}</p>
          <h2 id="compare-teaser" className="text-lg font-semibold">
            {t("heroes.compare.teaser.title", { rank })}
          </h2>
        </div>
      </div>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.kind} className="flex items-center gap-3">
            <HeroPortrait hero={heroes.get(r.heroId)} heroId={r.heroId} size="sm" />
            <div className="min-w-0 text-sm">
              <p
                className={cn(
                  "text-[0.65rem] font-semibold tracking-wider uppercase",
                  r.kind === "weak" ? "text-loss" : "text-win",
                )}
              >
                {t(r.kind === "weak" ? "heroes.compare.workOn" : "heroes.compare.strength")}
              </p>
              <p className="font-medium">
                {t(`heroes.compare.gap.${r.stat.stat}.${r.stat.better ? "better" : "worse"}`, {
                  hero: heroName(heroes.get(r.heroId), r.heroId),
                  pct: Math.abs(r.stat.diffPct),
                  rank,
                })}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("heroes.compare.numbers", {
                  yours: value(r.stat.stat, r.stat.yours),
                  theirs: value(r.stat.stat, r.stat.theirs),
                })}
              </p>
            </div>
          </li>
        ))}
      </ul>
      <Link href="/heroes/compare" className="inline-block text-sm text-gold hover:underline">
        {t("heroes.compare.teaser.link")}
      </Link>
    </section>
  );
}
