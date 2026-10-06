import Link from "next/link";
import { ChevronDown, Info, Loader2, Swords, UsersRound } from "lucide-react";
import { cn } from "cn";
import { StatTile } from "@/components/stat-tile";
import type { HeroInfo } from "@/modules/matches/domain/read-models";
import { getT } from "@/common/i18n/server";
import { plural } from "@/common/i18n/translate";
import { formatAgo, formatPercent } from "@/modules/matches/ui/format";
import { HeroPortrait, heroName } from "@/modules/matches/ui/hero-portrait";
import { MatchRows } from "@/modules/matches/ui/recent-matches-card";
import { displayName, PlayerAvatar } from "@/modules/players/ui/player-avatar";
import type { PairAnalysis, SharedMatchRow } from "../dtos/responses/together.dto";
import { MIN_HERO_PAIR_GAMES, type HeroPair, type PairSummary } from "../domain/together-stats";
import { comparisonCopy } from "./copy";

export interface PairMember {
  accountId32: number;
  personaName: string | null;
  avatarUrl: string | null;
}

/** Both players side by side. */
export async function PairBanner({
  me,
  friend,
  children,
}: {
  me: PairMember;
  friend: PairMember;
  children?: React.ReactNode;
}) {
  const t = await getT();
  const myName = displayName(me.personaName, me.accountId32);
  const friendName = displayName(friend.personaName, friend.accountId32);
  return (
    <section
      className="panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6"
      aria-label={t("together.pair.label")}
    >
      <span className="flex shrink-0 -space-x-3">
        <PlayerAvatar
          url={me.avatarUrl}
          name={myName}
          size="lg"
          className="ring-2 ring-background"
        />
        <PlayerAvatar
          url={friend.avatarUrl}
          name={friendName}
          size="lg"
          className="ring-2 ring-background"
        />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="kicker">{t("together.pair.kicker")}</p>
        <h1 className="font-display text-2xl font-bold tracking-wide break-words sm:text-3xl">
          {t("together.pair.you")} <span className="text-gold">&amp;</span> {friendName}
        </h1>
        <p className="text-sm text-muted-foreground">
          <Link
            href={`/players/${friend.accountId32}`}
            className="hover:text-foreground hover:underline"
          >
            {t("together.pair.viewProfile", { name: friendName })}
          </Link>
        </p>
      </div>
      {children}
    </section>
  );
}

/** Headline tiles: games together, win rate together and the comparison with your usual. */
export async function PairStats({ analysis, now }: { analysis: PairAnalysis; now: Date }) {
  const { summary, comparison, baseline } = analysis;
  const { together } = summary;
  const t = await getT();
  const copy = comparisonCopy(t, comparison, baseline);
  return (
    <section aria-label={t("together.pair.statsLabel")} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          label={t("together.pair.gamesTogether")}
          value={together.games.toLocaleString("en-US")}
          detail={
            summary.lastPlayedAt
              ? t("together.pair.confirmedLast", { ago: formatAgo(summary.lastPlayedAt, now) })
              : t("together.pair.confirmedOnly")
          }
        />
        <StatTile
          label={t("together.pair.winRateTogether")}
          value={formatPercent(summary.winRate)}
          meter={summary.winRate}
          tone={
            together.games === 0
              ? "muted"
              : summary.winRate !== null && summary.winRate >= 0.5
                ? "win"
                : "loss"
          }
          detail={`${plural(t, "together.units.win", together.wins)} · ${plural(t, "together.units.loss", together.games - together.wins)}`}
        />
        <div className="panel flex flex-col gap-1 p-4">
          <span className="kicker">{t("together.pair.comparedKicker")}</span>
          <span
            className={cn(
              "text-xl font-semibold tracking-tight sm:text-2xl",
              copy.tone === "win" && "text-win",
              copy.tone === "loss" && "text-loss",
              copy.tone === "muted" && "text-muted-foreground",
            )}
          >
            {copy.value}
          </span>
          <span className="text-xs text-muted-foreground">{copy.detail}</span>
        </div>
      </div>
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        <span>
          {t("together.pair.partyNote")} {t("together.comparison.caveat")}
        </span>
      </p>
    </section>
  );
}

/** Shown while some shared matches still need their party data checked. */
export async function PendingNotice({
  pending,
  interrupted,
  href,
}: {
  pending: number;
  interrupted: boolean;
  href: string;
}) {
  if (pending === 0) return null;
  const t = await getT();
  return (
    <p
      role="status"
      className="panel flex flex-wrap items-center gap-x-3 gap-y-1 p-4 text-sm text-muted-foreground"
    >
      <Loader2
        aria-hidden
        className="size-4 shrink-0 animate-spin text-gold motion-reduce:animate-none"
      />
      <span className="flex-1">
        {t("together.pair.pending", {
          count: plural(t, "together.units.sharedMatch", pending),
          paused: interrupted ? t("together.pair.paused") : "",
        })}
      </span>
      <Link href={href} className="text-gold hover:underline">
        {t("together.pair.checkMore")}
      </Link>
    </p>
  );
}

/** Recent form together: newest last so it reads like a timeline. */
export async function FormTogether({
  form,
  heroes,
}: {
  form: PairSummary["form"];
  heroes: Map<number, HeroInfo>;
}) {
  if (form.length === 0) return null;
  const t = await getT();
  const wins = form.filter((f) => f.result === "win").length;
  return (
    <section className="panel p-5" aria-labelledby="form-together">
      <div className="mb-3 flex items-baseline justify-between">
        <div>
          <p className="kicker">{t("together.form.kicker")}</p>
          <h2 id="form-together" className="text-lg font-semibold">
            {t("together.form.title", {
              games: plural(t, "together.units.partyGame", form.length),
            })}
          </h2>
        </div>
        <span className="text-sm tabular-nums">
          <span className="font-semibold text-win">{wins}W</span>
          <span className="text-muted-foreground"> · </span>
          <span className="font-semibold text-loss">{form.length - wins}L</span>
        </span>
      </div>
      <ol className="flex flex-wrap gap-1.5">
        {[...form].reverse().map((f) => {
          const win = f.result === "win";
          const name = heroName(heroes.get(f.heroId), f.heroId);
          return (
            <li key={f.matchId}>
              <Link
                href={`/matches/${f.matchId}`}
                title={`${win ? t("together.form.win") : t("together.form.loss")} · ${name}`}
                className={cn(
                  "grid size-9 place-items-center rounded-md text-xs font-bold ring-1 transition-transform hover:-translate-y-0.5 focus-visible:-translate-y-0.5",
                  win ? "bg-win/10 text-win ring-win/40" : "bg-loss/10 text-loss ring-loss/40",
                )}
              >
                <span aria-hidden>{win ? "W" : "L"}</span>
                <span className="sr-only">
                  {win
                    ? t("together.form.winAs", { hero: name })
                    : t("together.form.lossAs", { hero: name })}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Your hero + their hero, in confirmed party games. */
export async function HeroPairsTable({
  pairs,
  heroes,
  friendName,
}: {
  pairs: HeroPair[];
  heroes: Map<number, HeroInfo>;
  friendName: string;
}) {
  const t = await getT();
  return (
    <section className="panel overflow-hidden" aria-labelledby="hero-pairs">
      <div className="p-5 pb-3">
        <p className="kicker">{t("together.heroPairs.kicker")}</p>
        <h2 id="hero-pairs" className="text-lg font-semibold">
          {t("together.heroPairs.title")}
        </h2>
        <p className="text-xs text-muted-foreground">
          {t("together.heroPairs.description", { min: MIN_HERO_PAIR_GAMES })}
        </p>
      </div>
      {pairs.length === 0 ? (
        <p className="border-t border-white/[0.06] px-5 py-6 text-sm text-muted-foreground">
          {t("together.heroPairs.empty", { min: MIN_HERO_PAIR_GAMES })}
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead className="border-y border-white/[0.06] text-left text-[0.65rem] tracking-wider text-muted-foreground uppercase">
            <tr>
              <th scope="col" className="px-5 py-2 font-medium">
                {t("together.heroPairs.you")}
              </th>
              <th scope="col" className="px-2 py-2 font-medium">
                {friendName}
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                {t("together.heroPairs.games")}
              </th>
              <th scope="col" className="px-5 py-2 text-right font-medium">
                {t("together.heroPairs.record")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {pairs.map((p) => {
              const mine = heroes.get(p.myHeroId);
              const theirs = heroes.get(p.friendHeroId);
              return (
                <tr key={`${p.myHeroId}:${p.friendHeroId}`}>
                  <td className="px-5 py-2.5">
                    <span className="flex items-center gap-2">
                      <HeroPortrait hero={mine} heroId={p.myHeroId} size="xs" />
                      <span className="truncate">{heroName(mine, p.myHeroId)}</span>
                    </span>
                  </td>
                  <td className="px-2 py-2.5">
                    <span className="flex items-center gap-2">
                      <HeroPortrait hero={theirs} heroId={p.friendHeroId} size="xs" />
                      <span className="truncate">{heroName(theirs, p.friendHeroId)}</span>
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{p.games}</td>
                  <td className="px-5 py-2.5 text-right whitespace-nowrap tabular-nums">
                    <span className="text-win">{p.wins}W</span>{" "}
                    <span className="text-loss">{p.games - p.wins}L</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** Confirmed party matches, newest first; rows link to the scoreboard. */
export async function PartyMatches({
  rows,
  heroes,
  now,
}: {
  rows: SharedMatchRow[];
  heroes: Map<number, HeroInfo>;
  now: Date;
}) {
  const t = await getT();
  const party = rows.filter((r) => r.relation === "party").slice(0, 20);
  return (
    <section className="panel overflow-hidden" aria-labelledby="party-matches">
      <div className="p-5 pb-3">
        <p className="kicker">{t("together.partyMatches.kicker")}</p>
        <h2 id="party-matches" className="text-lg font-semibold">
          {t("together.partyMatches.title")}
        </h2>
      </div>
      {party.length === 0 ? (
        <div className="flex items-start gap-3 border-t border-white/[0.06] px-5 py-6 text-sm text-muted-foreground">
          <UsersRound aria-hidden className="mt-0.5 size-5 shrink-0" />
          <p>{t("together.partyMatches.empty")}</p>
        </div>
      ) : (
        <MatchRows matches={party.map((r) => r.match)} heroes={heroes} now={now} />
      )}
    </section>
  );
}

/** Collapsed list of shared matches that don't count as "together". */
export async function OtherSharedMatches({
  rows,
  heroes,
  now,
  friendName,
}: {
  rows: SharedMatchRow[];
  heroes: Map<number, HeroInfo>;
  now: Date;
  friendName: string;
}) {
  const t = await getT();
  const sameTeam = rows.filter(
    (r) => r.relation === "same_team_unknown" || r.relation === "same_team_separate",
  );
  const against = rows.filter((r) => r.relation === "opponents");
  const unknown = rows.filter((r) => r.relation === "undetermined").length;
  const unknownParty = sameTeam.filter((r) => r.relation === "same_team_unknown").length;

  return (
    <section aria-label={t("together.other.label")} className="space-y-3">
      <details className="panel group overflow-hidden">
        <summary className="flex cursor-pointer list-none items-center gap-3 p-5 [&::-webkit-details-marker]:hidden">
          <UsersRound aria-hidden className="size-4 text-muted-foreground" />
          <span className="flex-1">
            <span className="block font-semibold">{t("together.other.sameTeamTitle")}</span>
            <span className="block text-xs text-muted-foreground">
              {t("together.other.sameTeamSummary", {
                games: plural(t, "together.units.game", sameTeam.length),
              })}
            </span>
          </span>
          <ChevronDown
            aria-hidden
            className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
          />
        </summary>
        <p className="border-t border-white/[0.06] px-5 py-3 text-xs text-muted-foreground">
          {unknownParty > 0
            ? `${t("together.other.noPartyData", { games: plural(t, "together.units.game", unknownParty) })} `
            : ""}
          {sameTeam.length - unknownParty > 0
            ? `${t("together.other.separately", { games: plural(t, "together.units.game", sameTeam.length - unknownParty) })} `
            : ""}
          {t("together.other.never")}
        </p>
        {sameTeam.length > 0 && (
          <MatchRows matches={sameTeam.map((r) => r.match)} heroes={heroes} now={now} />
        )}
      </details>

      <details className="panel group overflow-hidden">
        <summary className="flex cursor-pointer list-none items-center gap-3 p-5 [&::-webkit-details-marker]:hidden">
          <Swords aria-hidden className="size-4 text-muted-foreground" />
          <span className="flex-1">
            <span className="block font-semibold">{t("together.other.againstTitle")}</span>
            <span className="block text-xs text-muted-foreground">
              {t("together.other.againstSummary", {
                games: plural(t, "together.units.game", against.length),
                name: friendName,
              })}
            </span>
          </span>
          <ChevronDown
            aria-hidden
            className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
          />
        </summary>
        {against.length > 0 ? (
          <MatchRows matches={against.map((r) => r.match)} heroes={heroes} now={now} />
        ) : (
          <p className="border-t border-white/[0.06] px-5 py-4 text-sm text-muted-foreground">
            {t("together.other.noneAgainst")}
          </p>
        )}
      </details>

      {unknown > 0 && (
        <p className="text-xs text-muted-foreground">
          {plural(t, "together.other.unchecked", unknown)}
        </p>
      )}
    </section>
  );
}
