import { EyeOff } from "lucide-react";
import { StatTile } from "@/components/stat-tile";
import { Skeleton } from "@/components/ui/skeleton";
import { getT } from "@/common/i18n/server";
import type { Messages } from "@/common/i18n/messages";
import { plural, type Translator } from "@/common/i18n/translate";
import type { HeroInfo } from "@/modules/matches/domain/read-models";
import { formatPercent } from "@/modules/matches/ui/format";
import { heroName } from "@/modules/matches/ui/hero-portrait";
import { MatchRows } from "@/modules/matches/ui/recent-matches-card";
import type { PublicPlayerSections } from "@/modules/players";
import {
  topHeroes,
  topTeammates,
  totalGames,
  winRate,
} from "@/modules/players/domain/public-player";
import { MostPlayedHeroesCard } from "@/modules/players/ui/most-played-heroes-card";
import { PlaysWithCard } from "@/modules/players/ui/plays-with-card";

// Each section awaits only its own data, so the page streams them in as they answer.

type What = keyof Messages["players"]["profile"]["what"];

export function upstreamErrorCopy(
  t: Translator<Messages>,
  error: { type: string },
  what: What,
): string {
  const thing = t(`players.profile.what.${what}`);
  return error.type === "rate_limited"
    ? t("players.profile.upstreamBusy", { what: thing })
    : t("players.profile.upstreamError", { what: thing });
}

export function LimitedHistory({ t }: { t: Translator<Messages> }) {
  return (
    <section className="panel flex items-start gap-3 p-5 text-sm" aria-labelledby="limited-history">
      <EyeOff aria-hidden className="mt-0.5 size-5 shrink-0 text-gold" />
      <div className="space-y-1">
        <h2 id="limited-history" className="font-semibold">
          {t("players.profile.limitedTitle")}
        </h2>
        <p className="text-muted-foreground">{t("players.profile.limitedBody")}</p>
      </div>
    </section>
  );
}

/** No public games at all looks like a hidden match history. */
export async function LimitedHistoryIfEmpty({
  record,
  matches,
}: Pick<PublicPlayerSections, "record" | "matches">) {
  const [r, m, t] = await Promise.all([record, matches, getT()]);
  const empty = r.ok && totalGames(r.value) === 0 && m.ok && m.value.length === 0;
  return empty ? <LimitedHistory t={t} /> : null;
}

export async function RecordTiles({ record }: Pick<PublicPlayerSections, "record">) {
  const [res, t] = await Promise.all([record, getT()]);
  if (!res.ok)
    return (
      <p
        role="alert"
        className="panel flex items-center p-4 text-sm text-muted-foreground sm:col-span-2"
      >
        {upstreamErrorCopy(t, res.error, "record")}
      </p>
    );
  const games = totalGames(res.value);
  const rate = winRate(res.value.wins, games);
  return (
    <>
      <StatTile
        label={t("players.profile.winRate")}
        value={formatPercent(rate)}
        meter={rate}
        tone={rate !== null && rate >= 0.5 ? "win" : "loss"}
        detail={`${plural(t, "players.units.win", res.value.wins)} · ${plural(t, "players.units.loss", res.value.losses)}`}
      />
      <StatTile
        label={t("players.profile.gamesPlayed")}
        value={games.toLocaleString("en-US")}
        detail={t("players.profile.allPublic")}
      />
    </>
  );
}

export async function FavouriteHeroTile({
  heroes,
  catalog,
}: Pick<PublicPlayerSections, "heroes"> & { catalog: Promise<Map<number, HeroInfo>> }) {
  const [res, cat, t] = await Promise.all([heroes, catalog, getT()]);
  const favourite = res.ok ? topHeroes(res.value, 1)[0] : undefined;
  return (
    <StatTile
      label={t("players.profile.mostPlayedHero")}
      value={favourite ? heroName(cat.get(favourite.heroId), favourite.heroId) : "—"}
      detail={
        favourite
          ? t("players.profile.heroDetail", {
              games: plural(t, "players.units.game", favourite.games),
              rate: formatPercent(winRate(favourite.wins, favourite.games)),
            })
          : t("players.profile.noHeroStats")
      }
    />
  );
}

export async function PlaysWith({
  peers,
  now,
}: Pick<PublicPlayerSections, "peers"> & { now: Date }) {
  const [res, t] = await Promise.all([peers, getT()]);
  return (
    <PlaysWithCard
      peers={res.ok ? topTeammates(res.value, 10) : []}
      now={now}
      error={res.ok ? null : upstreamErrorCopy(t, res.error, "teammates")}
    />
  );
}

export async function MostPlayedHeroes({
  heroes,
  catalog,
}: Pick<PublicPlayerSections, "heroes"> & { catalog: Promise<Map<number, HeroInfo>> }) {
  const [res, cat, t] = await Promise.all([heroes, catalog, getT()]);
  return (
    <MostPlayedHeroesCard
      heroes={res.ok ? topHeroes(res.value, 8) : []}
      catalog={cat}
      error={res.ok ? null : upstreamErrorCopy(t, res.error, "heroStats")}
    />
  );
}

export async function RecentMatches({
  matches,
  catalog,
  now,
}: Pick<PublicPlayerSections, "matches"> & {
  catalog: Promise<Map<number, HeroInfo>>;
  now: Date;
}) {
  const [res, cat, t] = await Promise.all([matches, catalog, getT()]);
  if (!res.ok)
    return (
      <p
        role="alert"
        className="border-t border-white/[0.06] px-5 py-6 text-sm text-muted-foreground"
      >
        {upstreamErrorCopy(t, res.error, "recentMatches")}
      </p>
    );
  if (res.value.length === 0)
    return (
      <p className="border-t border-white/[0.06] px-5 py-6 text-sm text-muted-foreground">
        {t("players.profile.noMatches")}
      </p>
    );
  return <MatchRows matches={res.value} heroes={cat} now={now} />;
}

export function MatchRowsSkeleton() {
  return (
    <div className="space-y-2 border-t border-white/[0.06] px-5 py-4">
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} className="h-11 rounded-lg" />
      ))}
    </div>
  );
}
