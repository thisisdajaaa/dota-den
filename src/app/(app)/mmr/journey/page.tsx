import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Info, Route } from "lucide-react";
import { getT } from "@/common/i18n/server";
import { getViewerTimeZone } from "@/common/http/request-context";
import { plural } from "@/common/i18n/translate";
import { PageHeader } from "@/components/page-header";
import { SegmentedLinks } from "@/components/segmented-links";
import { StatTile } from "@/components/stat-tile";
import { getCurrentUser } from "@/modules/identity";
import { matchesService } from "@/modules/matches";
import { parseRankTier } from "@/modules/matches/domain/rank-tier";
import { rankLabel } from "@/modules/matches/ui/rank-medal";
import { mmrInsightsService } from "@/modules/mmr";
import {
  GAP_DAYS,
  isJourneyRange,
  JOURNEY_RANGES,
  MIN_STRETCH_DAYS,
  type JourneyRange,
} from "@/modules/mmr/domain/journey";
import { JourneyChart, type JourneyChartBand } from "@/modules/mmr/ui/journey-chart";
import { JourneyStretchCard } from "@/modules/mmr/ui/journey-stretch-card";
import { ShareButton } from "@/modules/shares/ui/share-button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("mmr.journey.title") };
}

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

const signed = (v: number) =>
  `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v).toLocaleString("en-US")}`;
/** What a stretch card shows, from a medal or MMR stretch. */
const base = (s: {
  from: { at: Date };
  to: { at: Date };
  games: number;
  wins: number;
  losses: number;
  heroes: Array<{ heroId: number; games: number; wins: number }>;
}) => ({
  from: s.from.at,
  to: s.to.at,
  games: s.games,
  wins: s.wins,
  losses: s.losses,
  heroes: s.heroes,
});
const medalName = (tier: number) => {
  const r = parseRankTier(tier);
  return r ? rankLabel(r) : String(tier);
};

/** The rank journey: medal changes and logged MMR over months, kept apart (spec §2.1). */
export default async function JourneyPage({ searchParams }: PageProps<"/mmr/journey">) {
  const user = await getCurrentUser();
  if (!user) return null;
  const params = await searchParams;
  const rangeParam = one(params.range);
  const range: JourneyRange = isJourneyRange(rangeParam) ? rangeParam : "6m";
  const owner = { userId: user.id, accountId32: user.accountId32 };
  const [t, { timeZone }, journey, heroes] = await Promise.all([
    getT(),
    getViewerTimeZone(),
    mmrInsightsService.journey(owner, range),
    matchesService.heroMap(),
  ]);
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const j = journey;
  const empty = j.medals.length === 0 && j.mmr.length === 0;

  const bands: JourneyChartBand[] = [];
  for (const [s, tone, lane] of [
    [j.medalClimb, "win", "medal"],
    [j.medalSlide, "loss", "medal"],
    [j.mmrClimb, "win", "mmr"],
    [j.mmrSlide, "loss", "mmr"],
  ] as const)
    if (s) bands.push({ from: s.from.at.getTime(), to: s.to.at.getTime(), tone, lane });

  type Row = { at: Date; what: string; value: string };
  const rows: Row[] = [
    ...j.medals.map((m) => ({
      at: m.carried ? m.firstSeenAt : m.at,
      what: m.carried ? t("mmr.journey.kindCarried") : t("mmr.journey.kindMedal"),
      value: medalName(m.rankTier),
    })),
    ...j.mmr.map((p) => ({
      at: p.at,
      what: t("mmr.journey.kindMmr"),
      value: p.mmr.toLocaleString("en-US"),
    })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  const medalDetail = (p: (typeof j.medals)[number] | null) =>
    p
      ? p.carried
        ? t("mmr.journey.heldSince", { date: day.format(p.firstSeenAt) })
        : t("mmr.journey.reached", { date: day.format(p.at) })
      : t("mmr.journey.noMedal");
  const mmrDetail = (p: (typeof j.mmr)[number] | null) =>
    p ? t("mmr.journey.logged", { date: day.format(p.at) }) : t("mmr.journey.noEntries");

  return (
    <div className="space-y-6">
      <PageHeader
        kicker={t("mmr.journey.kicker")}
        title={t("mmr.journey.title")}
        description={t("mmr.journey.description")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/mmr"
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-white/[0.05] hover:text-foreground"
            >
              <ArrowLeft aria-hidden className="size-4" /> {t("mmr.journey.back")}
            </Link>
            {j.medals.length > 0 && <ShareButton target={{ kind: "journey", range }} />}
          </div>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedLinks
          label={t("mmr.journey.range")}
          options={JOURNEY_RANGES.map((value) => ({
            value,
            label: t(`mmr.journey.ranges.${value}`),
          }))}
          active={range}
          href={(v) => (v === "6m" ? "/mmr/journey" : `/mmr/journey?range=${v}`)}
        />
        {j.medals.length > 0 && (
          <p className="text-xs text-muted-foreground">{t("mmr.journey.shareNote")}</p>
        )}
      </div>

      <section
        aria-label={t("mmr.journey.summary")}
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        <StatTile
          label={t("mmr.journey.medalPeak")}
          value={j.medalPeak ? medalName(j.medalPeak.rankTier) : "—"}
          detail={medalDetail(j.medalPeak)}
          tone="gold"
        />
        <StatTile
          label={t("mmr.journey.medalLow")}
          value={j.medalLow ? medalName(j.medalLow.rankTier) : "—"}
          detail={medalDetail(j.medalLow)}
        />
        <StatTile
          label={t("mmr.journey.mmrPeak")}
          value={j.mmrPeak ? j.mmrPeak.mmr.toLocaleString("en-US") : "—"}
          detail={mmrDetail(j.mmrPeak)}
          tone="gold"
        />
        <StatTile
          label={t("mmr.journey.mmrLow")}
          value={j.mmrLow ? j.mmrLow.mmr.toLocaleString("en-US") : "—"}
          detail={mmrDetail(j.mmrLow)}
        />
      </section>

      <section className="panel space-y-4 p-5" aria-labelledby="journey-timeline">
        <h2 id="journey-timeline" className="text-lg font-semibold">
          {t("mmr.journey.timeline")}
        </h2>
        {empty ? (
          <div className="grid place-items-center gap-3 py-10 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-gold/10 text-gold ring-1 ring-gold/30">
              <Route aria-hidden className="size-5" />
            </span>
            <p className="max-w-md text-sm text-muted-foreground">{t("mmr.journey.empty")}</p>
          </div>
        ) : (
          <>
            <JourneyChart
              from={j.from.getTime()}
              to={j.to.getTime()}
              medals={j.medals.map((m) => ({
                t: m.at.getTime(),
                rankTier: m.rankTier,
                label: medalName(m.rankTier),
                dateLabel: day.format(m.carried ? m.firstSeenAt : m.at),
              }))}
              medalEnd={j.medals.at(-1)?.lastSeenAt.getTime() ?? null}
              entries={j.mmr.map((p) => ({
                t: p.at.getTime(),
                mmr: p.mmr,
                dateLabel: day.format(p.at),
              }))}
              gapDays={GAP_DAYS}
              bands={bands}
              ariaLabel={t("mmr.journey.chart", {
                from: day.format(j.from),
                to: day.format(j.to),
                medals: plural(t, "mmr.journey.medalCount", j.medals.length),
                entries: plural(t, "mmr.journey.entryCount", j.mmr.length),
              })}
            />
            <div className="space-y-1.5 text-xs text-muted-foreground">
              {j.medals.length > 0 && (
                <p>
                  {t("mmr.journey.lastChecked", {
                    date: day.format(j.medals.at(-1)!.lastSeenAt),
                  })}
                </p>
              )}
              {j.gaps.map((g) => (
                <p key={g.from.toISOString()} className="flex gap-2">
                  <Info aria-hidden className="mt-px size-3.5 shrink-0" />
                  {t("mmr.journey.gap", {
                    days: g.days,
                    from: day.format(g.from),
                    to: day.format(g.to),
                  })}
                </p>
              ))}
              <p>{t("mmr.journey.footnote")}</p>
              {j.record.games > 0 && (
                <p>
                  {t("mmr.journey.rangeRecord", {
                    games: plural(t, "mmr.journey.rankedGames", j.record.games),
                    record: t("mmr.journey.record", {
                      wins: j.record.wins,
                      losses: j.record.losses,
                    }),
                  })}
                </p>
              )}
            </div>
            <details className="rounded-lg border border-white/[0.06]">
              <summary className="cursor-pointer px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
                {t("mmr.journey.table")}
              </summary>
              <div className="max-h-80 overflow-y-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">{t("mmr.journey.caption")}</caption>
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-medium">
                        {t("mmr.journey.date")}
                      </th>
                      <th scope="col" className="px-3 py-2 font-medium">
                        {t("mmr.journey.what")}
                      </th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">
                        {t("mmr.journey.value")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.05]">
                    {rows.map((r, i) => (
                      <tr key={i}>
                        <td className="px-3 py-1.5 tabular-nums">{day.format(r.at)}</td>
                        <td className="px-3 py-1.5 text-muted-foreground">{r.what}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{r.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </section>

      {!empty && (
        <section className="space-y-3" aria-labelledby="journey-stretches">
          <div>
            <h2 id="journey-stretches" className="text-lg font-semibold">
              {t("mmr.journey.stretches")}
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              {t("mmr.journey.stretchesIntro", { days: MIN_STRETCH_DAYS })}
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <JourneyStretchCard
              title={t("mmr.journey.medalClimb")}
              tone="win"
              stretch={
                j.medalClimb && {
                  ...base(j.medalClimb),
                  change: `${medalName(j.medalClimb.from.rankTier)} → ${medalName(j.medalClimb.to.rankTier)}`,
                  amount: `+${plural(t, "mmr.journey.stars", j.medalClimb.steps)}`,
                }
              }
              emptyText={t("mmr.journey.noMedalClimb")}
              heroes={heroes}
              timeZone={timeZone}
            />
            <JourneyStretchCard
              title={t("mmr.journey.medalSlide")}
              tone="loss"
              stretch={
                j.medalSlide && {
                  ...base(j.medalSlide),
                  change: `${medalName(j.medalSlide.from.rankTier)} → ${medalName(j.medalSlide.to.rankTier)}`,
                  amount: `−${plural(t, "mmr.journey.stars", -j.medalSlide.steps)}`,
                }
              }
              emptyText={t("mmr.journey.noMedalSlide")}
              heroes={heroes}
              timeZone={timeZone}
            />
            <JourneyStretchCard
              title={t("mmr.journey.mmrClimb")}
              tone="win"
              stretch={
                j.mmrClimb && {
                  ...base(j.mmrClimb),
                  change: `${j.mmrClimb.from.mmr.toLocaleString("en-US")} → ${j.mmrClimb.to.mmr.toLocaleString("en-US")}`,
                  amount: t("mmr.journey.mmrDelta", { delta: signed(j.mmrClimb.delta) }),
                }
              }
              emptyText={t("mmr.journey.noMmrStretch", { days: MIN_STRETCH_DAYS })}
              heroes={heroes}
              timeZone={timeZone}
            />
            <JourneyStretchCard
              title={t("mmr.journey.mmrSlide")}
              tone="loss"
              stretch={
                j.mmrSlide && {
                  ...base(j.mmrSlide),
                  change: `${j.mmrSlide.from.mmr.toLocaleString("en-US")} → ${j.mmrSlide.to.mmr.toLocaleString("en-US")}`,
                  amount: t("mmr.journey.mmrDelta", { delta: signed(j.mmrSlide.delta) }),
                }
              }
              emptyText={t("mmr.journey.noMmrStretch", { days: MIN_STRETCH_DAYS })}
              heroes={heroes}
              timeZone={timeZone}
            />
          </div>
        </section>
      )}
    </div>
  );
}
