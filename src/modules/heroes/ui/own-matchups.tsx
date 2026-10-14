import Link from "next/link";
import { Hourglass, Swords } from "lucide-react";
import type { HeroInfo } from "@/modules/matches/domain/read-models";
import { getT } from "@/common/i18n/server";
import type { Messages } from "@/common/i18n/messages";
import { plural, type Translator } from "@/common/i18n/translate";
import { formatPercent } from "@/modules/matches/ui/format";
import { HeroPortrait, heroName } from "@/modules/matches/ui/hero-portrait";
import { WinRateBar } from "@/modules/matches/ui/win-rate-bar";
import { MetaSection } from "@/modules/meta/ui/meta-section";
import type { LineupProgress, MatchupRecord } from "../domain/own-matchups";
import type { OwnMatchupsView } from "../dtos/responses/heroes.dto";

type T = Translator<Messages>;

/** The lineup backfill's progress, said plainly: never a finished-looking page while it runs. */
export async function LineupProgressNote({ progress }: { progress: LineupProgress }) {
  const t = await getT();
  if (progress.inProgress) {
    return (
      <p
        role="status"
        className="panel flex items-start gap-2 px-5 py-3 text-sm text-muted-foreground"
      >
        <Hourglass aria-hidden className="mt-0.5 size-4 shrink-0 text-gold" />
        <span>
          {t("heroes.own.progressRunning", {
            done: progress.withLineups.toLocaleString("en-US"),
            total: plural(t, "heroes.counts.games", progress.total),
          })}
        </span>
      </p>
    );
  }
  if (progress.missing > 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {t("heroes.own.progressMissing", {
          games: plural(t, "heroes.counts.games", progress.missing),
        })}
      </p>
    );
  }
  return null;
}

function MatchupRows({
  title,
  note,
  rows,
  heroes,
  empty,
  showPlayedInto,
  t,
}: {
  title: string;
  note?: string;
  rows: MatchupRecord[];
  heroes: Map<number, HeroInfo>;
  empty: string;
  showPlayedInto: boolean;
  t: T;
}) {
  const games = (n: number) => plural(t, "heroes.counts.games", n);
  return (
    <div className="space-y-2">
      <div>
        <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          {title}
        </h3>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-2.5" aria-label={title}>
          {rows.map((r) => {
            const hero = heroes.get(r.heroId);
            const name = heroName(hero, r.heroId);
            return (
              <li
                key={r.heroId}
                aria-label={t("heroes.own.rowLabel", {
                  name,
                  wins: r.wins,
                  losses: r.losses,
                  rate: formatPercent(r.winRate),
                  games: games(r.games),
                })}
                className="grid grid-cols-[auto_1fr] items-center gap-3"
              >
                <HeroPortrait hero={hero} heroId={r.heroId} size="sm" />
                <div className="min-w-0 space-y-1">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <Link
                      href={`/heroes/${r.heroId}`}
                      className="truncate font-medium hover:text-gold hover:underline"
                    >
                      {name}
                    </Link>
                    <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                      <span className="font-semibold text-foreground">
                        {formatPercent(r.winRate)}
                      </span>{" "}
                      · {t("heroes.own.record", { wins: r.wins, losses: r.losses })} ·{" "}
                      {games(r.games)}
                    </span>
                  </div>
                  <WinRateBar rate={r.winRate} className="h-1.5" />
                  {showPlayedInto && r.playedInto.length > 0 && (
                    <p className="truncate text-xs text-muted-foreground">
                      {t("heroes.own.playedInto")}:{" "}
                      {r.playedInto
                        .map((p) =>
                          t("heroes.own.playedIntoItem", {
                            name: heroName(heroes.get(p.heroId), p.heroId),
                            wins: p.wins,
                            losses: p.losses,
                          }),
                        )
                        .join(" · ")}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Toughest and easiest opponents, and the allies you win and lose with. */
export async function OwnMatchupsSections({
  view,
  heroes,
  filtered,
}: {
  view: OwnMatchupsView;
  heroes: Map<number, HeroInfo>;
  /** Any filter is set (the empty state suggests widening it). */
  filtered: boolean;
}) {
  const t = await getT();
  const m = view.matchups;
  const games = (n: number) => plural(t, "heroes.counts.games", n);

  if (m.withLineups === 0) {
    return (
      <section className="panel grid place-items-center gap-3 px-6 py-16 text-center">
        <Swords aria-hidden className="size-8 text-gold" />
        <h2 className="text-lg font-semibold">{t("heroes.own.noGamesTitle")}</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          {t("heroes.own.noGames")} {filtered && t("heroes.own.noGamesFiltered")}
        </p>
      </section>
    );
  }

  const footer = t("heroes.own.footer", {
    min: m.minGames,
    enemies: plural(t, "heroes.counts.enemyHeroes", m.enemiesBelowMin),
    allies: plural(t, "heroes.counts.alliedHeroes", m.alliesBelowMin),
  });
  const sample = (
    <>
      {t("heroes.own.sample", {
        done: m.withLineups.toLocaleString("en-US"),
        games: games(m.games),
      })}{" "}
      {m.baseline && t("heroes.own.baseline", { rate: formatPercent(m.baseline.winRate) })}
    </>
  );

  return (
    <div className="space-y-6">
      <MetaSection
        id="own-matchups-opponents"
        kicker={t("heroes.own.kicker")}
        title={t("heroes.own.opponents")}
        description={sample}
        footer={footer}
      >
        <div className="grid grid-cols-1 gap-6 px-5 pb-5 md:grid-cols-2">
          <MatchupRows
            title={t("heroes.own.toughest")}
            note={t("heroes.own.toughestNote")}
            rows={m.toughest}
            heroes={heroes}
            empty={t("heroes.own.emptyToughest", { min: m.minGames })}
            showPlayedInto
            t={t}
          />
          <MatchupRows
            title={t("heroes.own.easiest")}
            note={t("heroes.own.easiestNote")}
            rows={m.easiest}
            heroes={heroes}
            empty={t("heroes.own.emptyEasiest", { min: m.minGames })}
            showPlayedInto
            t={t}
          />
        </div>
      </MetaSection>
      <MetaSection
        id="own-matchups-allies"
        kicker={t("heroes.own.kicker")}
        title={t("heroes.own.allies")}
        description={t("heroes.own.alliesNote")}
      >
        <div className="grid grid-cols-1 gap-6 px-5 pb-5 md:grid-cols-2">
          <MatchupRows
            title={t("heroes.own.bestAllies")}
            rows={m.bestAllies}
            heroes={heroes}
            empty={t("heroes.own.emptyBestAllies", { min: m.minGames })}
            showPlayedInto={false}
            t={t}
          />
          <MatchupRows
            title={t("heroes.own.worstAllies")}
            rows={m.worstAllies}
            heroes={heroes}
            empty={t("heroes.own.emptyWorstAllies", { min: m.minGames })}
            showPlayedInto={false}
            t={t}
          />
        </div>
      </MetaSection>
    </div>
  );
}
