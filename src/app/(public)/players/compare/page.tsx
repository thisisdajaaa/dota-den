import type { Metadata } from "next";
import Link from "next/link";
import { Fragment } from "react";
import { ArrowLeft, ArrowLeftRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { getT } from "@/common/i18n/server";
import { plural } from "@/common/i18n/translate";
import { getCurrentUser } from "@/modules/identity";
import { parseRankTier } from "@/modules/matches/domain/rank-tier";
import { matchesService } from "@/modules/matches";
import { formatPercent } from "@/modules/matches/ui/format";
import { HeroPortrait, heroName } from "@/modules/matches/ui/hero-portrait";
import { RankMedal, rankLabel } from "@/modules/matches/ui/rank-medal";
import {
  headToHead,
  MIN_SHARED_HERO_GAMES,
  playerSummary,
  sharedHeroes,
  type PlayerSummary,
  type Tally,
} from "@/modules/players/domain/compare";
import { parseAccountId } from "@/modules/players/domain/player-lookup";
import { topTeammates } from "@/modules/players/domain/public-player";
import { displayName, PlayerAvatar } from "@/modules/players/ui/player-avatar";
import { playersService, type PublicPlayerView } from "@/modules/players";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("players.compare.title") };
}

const rate = (t: Tally | null) => (t && t.games ? t.wins / t.games : null);

type Loaded = PublicPlayerView;

export default async function ComparePage({ searchParams }: PageProps<"/players/compare">) {
  const params = await searchParams;
  const t = await getT();
  const viewer = await getCurrentUser({ tolerateErrors: true });
  const a =
    parseAccountId(typeof params.a === "string" ? params.a : "") ?? viewer?.accountId32 ?? null;
  const b = parseAccountId(typeof params.b === "string" ? params.b : "");

  const header = (
    <PageHeader
      kicker={t("players.compare.kicker")}
      title={t("players.compare.title")}
      description={t("players.compare.description")}
      actions={
        <Button asChild variant="outline">
          <Link href="/players">
            <ArrowLeft aria-hidden className="size-4" /> {t("players.profile.back")}
          </Link>
        </Button>
      }
    />
  );

  if (a === null || b === null || a === b) {
    const aView = a !== null ? await playersService.publicPlayer(a) : null;
    const suggestions = aView?.peers.ok ? topTeammates(aView.peers.value, 6) : [];
    return (
      <div className="space-y-6">
        {header}
        <form
          action="/players/compare"
          className="panel grid gap-4 p-5 sm:grid-cols-[1fr_1fr_auto]"
        >
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">{t("players.compare.first")}</span>
            <input
              name="a"
              defaultValue={a ?? ""}
              placeholder="Account ID or profile link"
              className="h-10 rounded-lg border border-white/10 bg-background px-3"
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">{t("players.compare.second")}</span>
            <input
              name="b"
              defaultValue={b ?? ""}
              placeholder="Account ID or profile link"
              className="h-10 rounded-lg border border-white/10 bg-background px-3"
            />
          </label>
          <Button type="submit" className="gap-2 self-end">
            <ArrowLeftRight aria-hidden className="size-4" /> {t("players.compare.submit")}
          </Button>
        </form>
        {a !== null && a === b && (
          <p role="alert" className="text-sm text-loss">
            {t("players.compare.different")}
          </p>
        )}
        {a !== null && suggestions.length > 0 && (
          <section aria-labelledby="compare-suggestions" className="panel p-5">
            <h2 id="compare-suggestions" className="mb-3 text-sm font-semibold">
              {viewer?.accountId32 === a
                ? t("players.compare.suggestYou")
                : t("players.compare.suggestTheirs")}
            </h2>
            <ul className="flex flex-wrap gap-2">
              {suggestions.map((p) => (
                <li key={p.accountId32}>
                  <Link
                    href={`/players/compare?a=${a}&b=${p.accountId32}`}
                    className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-1.5 text-sm hover:border-gold/40"
                  >
                    <PlayerAvatar url={p.avatarUrl} name={p.personaName ?? ""} size="sm" />
                    {displayName(p.personaName, p.accountId32)}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    );
  }

  const [aView, bView, heroes] = await Promise.all([
    playersService.publicPlayer(a),
    playersService.publicPlayer(b),
    matchesService.heroMap(),
  ]);
  const side = (id: number, v: Loaded) => {
    const profile = v.profile.ok ? v.profile.value : null;
    return {
      id,
      profile,
      name: displayName(profile?.personaName ?? null, id),
      rank: parseRankTier(profile?.rankTier, profile?.leaderboardRank),
      summary: playerSummary({
        record: v.record.ok ? v.record.value : null,
        heroes: v.heroes.ok ? v.heroes.value : null,
        matches: v.matches.ok ? v.matches.value : null,
      }),
      found: v.profile.ok || v.profile.error.type !== "not_found",
    };
  };
  const left = side(a, aView);
  const right = side(b, bView);
  const shared =
    aView.heroes.ok && bView.heroes.ok
      ? sharedHeroes(aView.heroes.value, bView.heroes.value)
      : null;
  const h2h = aView.peers.ok ? headToHead(aView.peers.value, b) : null;

  const rows: {
    label: string;
    value: (s: PlayerSummary) => string;
    hint?: (s: PlayerSummary) => string;
  }[] = [
    {
      label: t("players.compare.winRate"),
      value: (s) => formatPercent(rate(s.record)),
      hint: (s) =>
        s.record
          ? plural(t, "players.units.game", s.record.games)
          : t("players.compare.unavailable"),
    },
    {
      label: t("players.compare.recentForm"),
      value: (s) => (s.recent.games ? `${s.recent.wins}–${s.recent.games - s.recent.wins}` : "—"),
      hint: (s) =>
        s.recent.games
          ? t("players.compare.lastGames", {
              games: plural(t, "players.units.game", s.recent.games),
            })
          : t("players.compare.noRecent"),
    },
    {
      label: t("players.compare.kda"),
      value: (s) => (s.kda === null ? "—" : s.kda.toFixed(2)),
      hint: (s) => (s.recent.games ? t("players.compare.kdaHint") : ""),
    },
    {
      label: t("players.compare.mostPlayed"),
      value: (s) => (s.topHero ? heroName(heroes.get(s.topHero.heroId), s.topHero.heroId) : "—"),
      hint: (s) =>
        s.topHero
          ? `${plural(t, "players.units.game", s.topHero.games)} · ${formatPercent(rate(s.topHero))}`
          : "",
    },
  ];

  return (
    <div className="space-y-6">
      {header}

      <section aria-label={t("players.compare.playersLabel")} className="grid grid-cols-2 gap-3">
        {[left, right].map((p) => (
          <div
            key={p.id}
            className="panel flex min-w-0 flex-col items-center gap-2 p-4 text-center"
          >
            <PlayerAvatar url={p.profile?.avatarUrl ?? null} name={p.name} size="lg" />
            <Link
              href={`/players/${p.id}`}
              className="max-w-full truncate font-semibold hover:text-gold"
            >
              {p.name}
            </Link>
            {p.rank ? (
              <span className="flex items-center gap-1.5 text-xs text-gold">
                <RankMedal rank={p.rank} size={32} /> {rankLabel(p.rank)}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">
                {p.found ? t("players.compare.rankNotPublic") : t("players.compare.playerNotFound")}
              </span>
            )}
          </div>
        ))}
      </section>

      <section aria-label={t("players.compare.sideBySide")} className="panel overflow-hidden">
        <table className="w-full table-fixed text-sm">
          <caption className="sr-only">
            {t("players.compare.caption", { a: left.name, b: right.name })}
          </caption>
          <tbody>
            {rows.map((r) => (
              <Fragment key={r.label}>
                <tr className="bg-white/[0.02]">
                  <th
                    colSpan={2}
                    scope="colgroup"
                    className="px-3 py-1 text-center text-[0.65rem] font-medium tracking-wider text-muted-foreground uppercase"
                  >
                    {r.label}
                  </th>
                </tr>
                <tr>
                  {[left, right].map((p, i) => (
                    <td key={p.id} className={i === 0 ? "p-3 text-right" : "p-3"}>
                      <span className="block font-semibold tabular-nums">{r.value(p.summary)}</span>
                      <span className="block text-xs text-muted-foreground">
                        {r.hint?.(p.summary)}
                      </span>
                    </td>
                  ))}
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="h2h" className="panel p-5">
        <h2 id="h2h" className="mb-2 text-lg font-semibold">
          {t("players.compare.h2hTitle")}
        </h2>
        {!aView.peers.ok ? (
          <p className="text-sm text-muted-foreground">{t("players.compare.unavailableNow")}</p>
        ) : !h2h ? (
          <p className="text-sm text-muted-foreground">{t("players.compare.noH2h")}</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            <li className="rounded-lg border border-white/[0.06] p-3">
              <p className="text-xs text-muted-foreground">{t("players.compare.sameTeam")}</p>
              <p className="text-lg font-semibold tabular-nums">
                {h2h.together.games ? formatPercent(rate(h2h.together)) : "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("players.compare.together", {
                  games: plural(t, "players.units.game", h2h.together.games),
                })}
                {h2h.together.games ? `, ${plural(t, "players.units.win", h2h.together.wins)}` : ""}
              </p>
            </li>
            <li className="rounded-lg border border-white/[0.06] p-3">
              <p className="text-xs text-muted-foreground">{t("players.compare.againstTitle")}</p>
              <p className="text-lg font-semibold tabular-nums">
                {h2h.against.games
                  ? `${left.name} ${h2h.against.wins}–${h2h.against.games - h2h.against.wins}`
                  : "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("players.compare.opposite", {
                  games: plural(t, "players.units.game", h2h.against.games),
                })}
              </p>
            </li>
          </ul>
        )}
      </section>

      <section aria-labelledby="shared-heroes" className="panel p-5">
        <h2 id="shared-heroes" className="mb-1 text-lg font-semibold">
          {t("players.compare.sharedTitle")}
        </h2>
        <p className="mb-3 text-xs text-muted-foreground">
          {t("players.compare.sharedNote", { min: MIN_SHARED_HERO_GAMES })}
        </p>
        {shared === null ? (
          <p className="text-sm text-muted-foreground">{t("players.compare.unavailableNow")}</p>
        ) : shared.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("players.compare.noShared")}</p>
        ) : (
          <ul className="divide-y divide-white/[0.05]">
            {shared.map((h) => (
              <li
                key={h.heroId}
                className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-2 text-sm"
              >
                <span className="text-right tabular-nums">
                  <span className="font-semibold">{formatPercent(rate(h.a))}</span>
                  <span className="block text-xs text-muted-foreground">
                    {plural(t, "players.units.game", h.a.games)}
                  </span>
                </span>
                <span className="flex flex-col items-center gap-1 text-center text-xs">
                  <HeroPortrait hero={heroes.get(h.heroId)} heroId={h.heroId} size="sm" />
                  {heroName(heroes.get(h.heroId), h.heroId)}
                </span>
                <span className="tabular-nums">
                  <span className="font-semibold">{formatPercent(rate(h.b))}</span>
                  <span className="block text-xs text-muted-foreground">
                    {plural(t, "players.units.game", h.b.games)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        {t("players.compare.footer", {
          games: plural(
            t,
            "players.units.game",
            Math.max(left.summary.recent.games, right.summary.recent.games),
          ),
        })}
      </p>
    </div>
  );
}
