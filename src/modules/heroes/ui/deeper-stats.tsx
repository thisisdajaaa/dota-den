import Link from "next/link";
import { cn } from "cn";
import { getT } from "@/common/i18n/server";
import { plural } from "@/common/i18n/translate";
import type { HeroInfo } from "@/modules/matches/domain/read-models";
import { formatPercent } from "@/modules/matches/ui/format";
import { HeroPortrait, heroName } from "@/modules/matches/ui/hero-portrait";
import { WinRateBar } from "@/modules/matches/ui/win-rate-bar";
import { POSITION_INFO } from "@/modules/meta/domain/position";
import type { WinRecord } from "../domain/hero-stats";
import { LENGTH_FROM, type DeeperStats } from "../domain/deeper-stats";

/** Rows differing from your overall win rate by at least this much are marked. */
const NOTABLE_GAP = 0.05;

interface Row extends WinRecord {
  id: string;
  label: React.ReactNode;
}

async function SplitCard({
  id,
  title,
  rows,
  overall,
  note,
  empty,
}: {
  id: string;
  title: string;
  rows: Row[];
  overall: number | null;
  note?: string | null;
  empty?: string;
}) {
  const t = await getT();
  const any = rows.some((r) => r.games > 0);
  return (
    <section aria-labelledby={id} className="panel space-y-3 p-5">
      <h2 id={id} className="text-base font-semibold">
        {title}
      </h2>
      {!any ? (
        <p className="text-sm text-muted-foreground">{empty ?? t("heroes.splits.noGames")}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const gap = r.winRate !== null && overall !== null ? r.winRate - overall : null;
            const notable = !r.lowSample && gap !== null && Math.abs(gap) >= NOTABLE_GAP;
            return (
              <li key={r.id} className={cn("space-y-1.5", r.games === 0 && "opacity-50")}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">{r.label}</span>
                  <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                    {r.games === 0 ? (
                      t("heroes.splits.none")
                    ) : (
                      <>
                        <span
                          className={cn(
                            r.lowSample ? "text-muted-foreground" : "font-semibold text-foreground",
                            notable && gap! > 0 && "text-win",
                            notable && gap! < 0 && "text-loss",
                          )}
                        >
                          {formatPercent(r.winRate)}
                        </span>{" "}
                        · {plural(t, "heroes.counts.games", r.games)}
                        {r.lowSample && ` · ${t("heroes.tooFewToJudge")}`}
                        {notable &&
                          ` · ${t(gap! > 0 ? "heroes.splits.above" : "heroes.splits.below", {
                            pts: Math.round(Math.abs(gap!) * 100),
                          })}`}
                      </>
                    )}
                  </span>
                </div>
                <WinRateBar rate={r.winRate} muted={r.lowSample} className="h-1.5" />
              </li>
            );
          })}
        </ul>
      )}
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </section>
  );
}

/** Plus: your record split six ways, each row against your overall win rate. */
export async function DeeperStatsView({
  stats,
  heroes,
}: {
  stats: DeeperStats;
  heroes: Map<number, HeroInfo>;
}) {
  const t = await getT();
  const games = (n: number) => plural(t, "heroes.counts.games", n);
  const overall = stats.overall.winRate;
  const s = stats;

  const patchNotes = [
    s.patches.older > 0 && t("heroes.splits.patches.older", { games: games(s.patches.older) }),
    s.patches.unassigned > 0 &&
      t("heroes.splits.patches.unassigned", { games: games(s.patches.unassigned) }),
  ].filter(Boolean);

  const lengthLabel = (k: keyof typeof LENGTH_FROM) =>
    t(`heroes.splits.lengths.${k}`, {
      from: LENGTH_FROM[k],
      to: { short: 25, normal: 35, long: 45, very_long: 0 }[k],
    });

  return (
    <div className="space-y-6">
      <p className="text-sm">
        {overall === null
          ? t("heroes.splits.overallNone")
          : t("heroes.splits.overall", {
              rate: formatPercent(overall),
              games: games(s.overall.games),
            })}
      </p>
      <div className="card-flow">
        <SplitCard
          id="split-patches"
          title={t("heroes.splits.patches.title")}
          overall={overall}
          rows={s.patches.rows.map((r) => ({
            ...r,
            id: r.key,
            label: t("heroes.splits.patches.row", { patch: r.key }),
          }))}
          note={patchNotes.length > 0 ? patchNotes.join(" · ") : null}
        />
        <SplitCard
          id="split-positions"
          title={t("heroes.splits.positions.title")}
          overall={overall}
          rows={s.positions.rows.map((r) => ({
            ...r,
            id: String(r.key),
            label: (
              <>
                <span className="font-semibold">{POSITION_INFO[r.key].short}</span>{" "}
                <span className="text-muted-foreground">{POSITION_INFO[r.key].name}</span>
              </>
            ),
          }))}
          empty={t("heroes.splits.needsParsed")}
          note={t("heroes.splits.positions.note", {
            games: games(s.positions.parsed),
            unplaced: s.positions.unplaced,
          })}
        />
        <SplitCard
          id="split-day"
          title={t("heroes.splits.dayParts.title")}
          overall={overall}
          rows={s.dayParts.map((r) => ({
            ...r,
            id: r.key,
            label: t(`heroes.splits.dayParts.${r.key}`),
          }))}
          note={t("heroes.splits.dayParts.note")}
        />
        <SplitCard
          id="split-length"
          title={t("heroes.splits.lengths.title")}
          overall={overall}
          rows={s.lengths.map((r) => ({ ...r, id: r.key, label: lengthLabel(r.key) }))}
        />
        <SplitCard
          id="split-lane-result"
          title={t("heroes.splits.laneOutcomes.title")}
          overall={overall}
          rows={s.laneOutcomes.rows.map((r) => ({
            ...r,
            id: r.key,
            label: t(`heroes.splits.laneOutcomes.${r.key}`),
          }))}
          empty={t("heroes.splits.needsParsed")}
          note={t("heroes.splits.laneOutcomes.note", { games: games(s.laneOutcomes.read) })}
        />
        <section aria-labelledby="split-partners" className="panel space-y-3 p-5">
          <h2 id="split-partners" className="text-base font-semibold">
            {t("heroes.splits.partners.title")}
          </h2>
          {s.partners.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {s.partners.read === 0
                ? t("heroes.splits.partners.noneRead")
                : t("heroes.splits.partners.noneListed", { min: s.partners.minGames })}
            </p>
          ) : (
            <ul className="space-y-3">
              {s.partners.rows.map((p) => {
                const hero = heroes.get(p.heroId);
                return (
                  <li key={p.heroId} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <Link
                        href={`/heroes/${p.heroId}`}
                        className="flex min-w-0 items-center gap-2 truncate hover:text-gold"
                      >
                        <HeroPortrait hero={hero} heroId={p.heroId} size="xs" />
                        {heroName(hero, p.heroId)}
                      </Link>
                      <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                        <span
                          className={cn(
                            p.lowSample ? "text-muted-foreground" : "font-semibold text-foreground",
                          )}
                        >
                          {formatPercent(p.winRate)}
                        </span>{" "}
                        · {t("heroes.splits.partners.record", { wins: p.wins, losses: p.losses })}
                        {p.lowSample && ` · ${t("heroes.tooFewToJudge")}`}
                      </span>
                    </div>
                    <WinRateBar rate={p.winRate} muted={p.lowSample} className="h-1.5" />
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            {t("heroes.splits.partners.note", {
              games: games(s.partners.read),
              min: s.partners.minGames,
            })}
          </p>
        </section>
      </div>
      <p className="text-xs text-muted-foreground">{t("heroes.splits.footnote")}</p>
    </div>
  );
}
