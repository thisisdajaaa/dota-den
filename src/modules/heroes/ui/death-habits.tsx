import { getT } from "@/common/i18n/server";
import { plural } from "@/common/i18n/translate";
import { StatTile } from "@/components/stat-tile";
import { clockTime } from "@/modules/matches/domain/match-laning";
import type { HeroInfo } from "@/modules/matches/domain/read-models";
import { HeroPortrait, heroName } from "@/modules/matches/ui/hero-portrait";
import { MIN_DEATH_GAMES, type DeathHabits } from "../domain/death-habits";

/** Your deaths: tiles, hero kills on you by game phase, and the heroes that kill you most. */
export async function DeathHabitsView({
  habits,
  heroes,
}: {
  habits: DeathHabits;
  heroes: ReadonlyMap<number, HeroInfo>;
}) {
  const t = await getT();
  const one = (n: number | null) => (n === null ? "—" : n.toFixed(1));
  const few = t("heroes.deaths.tiles.few", { min: MIN_DEATH_GAMES, n: habits.games });
  const top = Math.max(0, ...habits.byPhase.map((p) => p.per10 ?? 0));
  const split =
    habits.wins.perGame !== null && habits.losses.perGame !== null
      ? t("heroes.deaths.tiles.splitDetail", {
          wins: one(habits.wins.perGame),
          losses: one(habits.losses.perGame),
        })
      : t("heroes.deaths.tiles.splitFew", {
          min: MIN_DEATH_GAMES,
          wins: habits.wins.games,
          losses: habits.losses.games,
        });

  return (
    <div className="space-y-6">
      <section aria-label={t("heroes.deaths.tiles.label")}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile
            label={t("heroes.deaths.tiles.perGame")}
            value={one(habits.perGame)}
            detail={split}
          />
          <StatTile
            label={t("heroes.deaths.tiles.laning")}
            value={one(habits.laningPerGame)}
            detail={
              habits.cleanLaningShare === null
                ? few
                : t("heroes.deaths.tiles.laningDetail", {
                    share: `${Math.round(habits.cleanLaningShare * 100)}%`,
                  })
            }
          />
          <StatTile
            label={t("heroes.deaths.tiles.first")}
            value={habits.firstDeathSec === null ? "—" : clockTime(habits.firstDeathSec)}
            detail={habits.firstDeathSec === null ? few : t("heroes.deaths.tiles.firstDetail")}
          />
          <StatTile
            label={t("heroes.deaths.tiles.heroShare")}
            value={habits.heroShare === null ? "—" : `${Math.round(habits.heroShare * 100)}%`}
            detail={t("heroes.deaths.tiles.heroShareDetail")}
          />
        </div>
      </section>

      <div className="card-flow">
        <section aria-labelledby="deaths-phase" className="panel space-y-3 p-5">
          <div>
            <h2 id="deaths-phase" className="text-lg font-semibold">
              {t("heroes.deaths.phases.title")}
            </h2>
            <p className="text-xs text-muted-foreground">{t("heroes.deaths.phases.description")}</p>
          </div>
          <ul className="space-y-2 text-sm">
            {habits.byPhase.map((p) => (
              <li key={p.phase} className="grid grid-cols-[7.5rem_1fr_3rem] items-center gap-3">
                <span>{t(`heroes.deaths.phases.${p.phase}`)}</span>
                <span aria-hidden className="h-2 rounded-full bg-white/5">
                  {p.per10 !== null && p.per10 > 0 && (
                    <span
                      className="block h-2 rounded-full bg-loss/70"
                      style={{ width: `${Math.max(4, (p.per10 / top) * 100)}%` }}
                    />
                  )}
                </span>
                <span className="text-right tabular-nums">{one(p.per10)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="deaths-killers" className="panel space-y-3 p-5">
          <div>
            <h2 id="deaths-killers" className="text-lg font-semibold">
              {t("heroes.deaths.killers.title")}
            </h2>
            <p className="text-xs text-muted-foreground">
              {t("heroes.deaths.killers.description")}
            </p>
          </div>
          {habits.killers.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("heroes.deaths.killers.none")}</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {habits.killers.map((k) => (
                <li key={k.heroId} className="flex items-center gap-3">
                  <HeroPortrait hero={heroes.get(k.heroId)} heroId={k.heroId} size="xs" />
                  <span className="min-w-0 flex-1 truncate">
                    {heroName(heroes.get(k.heroId), k.heroId)}
                  </span>
                  <span className="shrink-0 text-muted-foreground tabular-nums">
                    {t("heroes.deaths.killers.row", {
                      kills: plural(t, "heroes.counts.kills", k.kills),
                      games: plural(t, "heroes.counts.games", k.games),
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
