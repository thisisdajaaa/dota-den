import Link from "next/link";
import { ChevronDown, Info, Loader2, Swords, UsersRound } from "lucide-react";
import { cn } from "cn";
import { StatTile } from "@/components/stat-tile";
import type { HeroInfo } from "@/modules/matches/application/ports";
import { formatAgo, formatPercent, plural } from "@/modules/matches/ui/format";
import { HeroPortrait, heroName } from "@/modules/matches/ui/hero-portrait";
import { MatchRows } from "@/modules/matches/ui/recent-matches-card";
import { displayName, PlayerAvatar } from "@/modules/players/ui/player-avatar";
import type { PairAnalysis, SharedMatchRow } from "../application/together-service";
import { MIN_HERO_PAIR_GAMES, type HeroPair, type PairSummary } from "../domain/together-stats";
import { CAVEAT, comparisonCopy } from "./copy";

const sharedMatches = (n: number) =>
  `${n.toLocaleString("en-US")} shared ${n === 1 ? "match" : "matches"}`;

export interface PairMember {
  accountId32: number;
  personaName: string | null;
  avatarUrl: string | null;
}

/** Both players side by side. */
export function PairBanner({
  me,
  friend,
  children,
}: {
  me: PairMember;
  friend: PairMember;
  children?: React.ReactNode;
}) {
  const myName = displayName(me.personaName, me.accountId32);
  const friendName = displayName(friend.personaName, friend.accountId32);
  return (
    <section
      className="panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6"
      aria-label="Pair"
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
        <p className="kicker">Playing together</p>
        <h1 className="font-display text-2xl font-bold tracking-wide break-words sm:text-3xl">
          You <span className="text-gold">&amp;</span> {friendName}
        </h1>
        <p className="text-sm text-muted-foreground">
          <Link
            href={`/players/${friend.accountId32}`}
            className="hover:text-foreground hover:underline"
          >
            View {friendName}&apos;s profile
          </Link>
        </p>
      </div>
      {children}
    </section>
  );
}

/** Headline tiles: games together, win rate together and the comparison with your usual. */
export function PairStats({ analysis, now }: { analysis: PairAnalysis; now: Date }) {
  const { summary, comparison, baseline } = analysis;
  const { together } = summary;
  const copy = comparisonCopy(comparison, baseline);
  return (
    <section aria-label="Together stats" className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          label="Games together"
          value={together.games.toLocaleString("en-US")}
          detail={
            summary.lastPlayedAt
              ? `Confirmed parties · last ${formatAgo(summary.lastPlayedAt, now)}`
              : "Confirmed parties only"
          }
        />
        <StatTile
          label="Win rate together"
          value={formatPercent(summary.winRate)}
          meter={summary.winRate}
          tone={
            together.games === 0
              ? "muted"
              : summary.winRate !== null && summary.winRate >= 0.5
                ? "win"
                : "loss"
          }
          detail={`${plural(together.wins, "win")} · ${plural(together.games - together.wins, "loss")}`}
        />
        <div className="panel flex flex-col gap-1 p-4">
          <span className="kicker">Compared with your usual</span>
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
          Only games where OpenDota reports you in the same party count as “together”. {CAVEAT}
        </span>
      </p>
    </section>
  );
}

/** Shown while some shared matches still need their party data checked. */
export function PendingNotice({
  pending,
  interrupted,
  href,
}: {
  pending: number;
  interrupted: boolean;
  href: string;
}) {
  if (pending === 0) return null;
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
        Analysing more matches… {sharedMatches(pending)} still to check
        {interrupted ? " (OpenDota is busy, so we paused)" : ""}. Stats below cover the ones checked
        so far.
      </span>
      <Link href={href} className="text-gold hover:underline">
        Check more now
      </Link>
    </p>
  );
}

/** Recent form together: newest last so it reads like a timeline. */
export function FormTogether({
  form,
  heroes,
}: {
  form: PairSummary["form"];
  heroes: Map<number, HeroInfo>;
}) {
  if (form.length === 0) return null;
  const wins = form.filter((f) => f.result === "win").length;
  return (
    <section className="panel p-5" aria-labelledby="form-together">
      <div className="mb-3 flex items-baseline justify-between">
        <div>
          <p className="kicker">Recent form together</p>
          <h2 id="form-together" className="text-lg font-semibold">
            Last {plural(form.length, "party game")}
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
                title={`${win ? "Win" : "Loss"} · ${name}`}
                className={cn(
                  "grid size-9 place-items-center rounded-md text-xs font-bold ring-1 transition-transform hover:-translate-y-0.5 focus-visible:-translate-y-0.5",
                  win ? "bg-win/10 text-win ring-win/40" : "bg-loss/10 text-loss ring-loss/40",
                )}
              >
                <span aria-hidden>{win ? "W" : "L"}</span>
                <span className="sr-only">
                  {win ? "Win" : "Loss"} as {name}
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
export function HeroPairsTable({
  pairs,
  heroes,
  friendName,
}: {
  pairs: HeroPair[];
  heroes: Map<number, HeroInfo>;
  friendName: string;
}) {
  return (
    <section className="panel overflow-hidden" aria-labelledby="hero-pairs">
      <div className="p-5 pb-3">
        <p className="kicker">Hero chemistry</p>
        <h2 id="hero-pairs" className="text-lg font-semibold">
          Best hero pairs
        </h2>
        <p className="text-xs text-muted-foreground">
          Combinations you played at least {MIN_HERO_PAIR_GAMES} times as a party, most played
          first.
        </p>
      </div>
      {pairs.length === 0 ? (
        <p className="border-t border-white/[0.06] px-5 py-6 text-sm text-muted-foreground">
          No hero pair played {MIN_HERO_PAIR_GAMES}+ times together yet.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead className="border-y border-white/[0.06] text-left text-[0.65rem] tracking-wider text-muted-foreground uppercase">
            <tr>
              <th scope="col" className="px-5 py-2 font-medium">
                You
              </th>
              <th scope="col" className="px-2 py-2 font-medium">
                {friendName}
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                Games
              </th>
              <th scope="col" className="px-5 py-2 text-right font-medium">
                Record
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
export function PartyMatches({
  rows,
  heroes,
  now,
}: {
  rows: SharedMatchRow[];
  heroes: Map<number, HeroInfo>;
  now: Date;
}) {
  const party = rows.filter((r) => r.relation === "party").slice(0, 20);
  return (
    <section className="panel overflow-hidden" aria-labelledby="party-matches">
      <div className="p-5 pb-3">
        <p className="kicker">Match history</p>
        <h2 id="party-matches" className="text-lg font-semibold">
          Recent games together
        </h2>
      </div>
      {party.length === 0 ? (
        <div className="flex items-start gap-3 border-t border-white/[0.06] px-5 py-6 text-sm text-muted-foreground">
          <UsersRound aria-hidden className="mt-0.5 size-5 shrink-0" />
          <p>No confirmed party games among the matches checked so far.</p>
        </div>
      ) : (
        <MatchRows matches={party.map((r) => r.match)} heroes={heroes} now={now} />
      )}
    </section>
  );
}

/** Collapsed list of shared matches that don't count as "together". */
export function OtherSharedMatches({
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
  const sameTeam = rows.filter(
    (r) => r.relation === "same_team_unknown" || r.relation === "same_team_separate",
  );
  const against = rows.filter((r) => r.relation === "opponents");
  const unknown = rows.filter((r) => r.relation === "undetermined").length;
  const unknownParty = sameTeam.filter((r) => r.relation === "same_team_unknown").length;

  return (
    <section aria-label="Other shared matches" className="space-y-3">
      <details className="panel group overflow-hidden">
        <summary className="flex cursor-pointer list-none items-center gap-3 p-5 [&::-webkit-details-marker]:hidden">
          <UsersRound aria-hidden className="size-4 text-muted-foreground" />
          <span className="flex-1">
            <span className="block font-semibold">Same team but party unknown</span>
            <span className="block text-xs text-muted-foreground">
              {plural(sameTeam.length, "game")} on the same team that don&apos;t count as together
            </span>
          </span>
          <ChevronDown
            aria-hidden
            className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
          />
        </summary>
        <p className="border-t border-white/[0.06] px-5 py-3 text-xs text-muted-foreground">
          {unknownParty > 0
            ? `${plural(unknownParty, "game")} had no party data, so we can't tell if you queued together. `
            : ""}
          {sameTeam.length - unknownParty > 0
            ? `In ${plural(sameTeam.length - unknownParty, "game")} you queued separately and were matched onto the same team. `
            : ""}
          We never count these as games together.
        </p>
        {sameTeam.length > 0 && (
          <MatchRows matches={sameTeam.map((r) => r.match)} heroes={heroes} now={now} />
        )}
      </details>

      <details className="panel group overflow-hidden">
        <summary className="flex cursor-pointer list-none items-center gap-3 p-5 [&::-webkit-details-marker]:hidden">
          <Swords aria-hidden className="size-4 text-muted-foreground" />
          <span className="flex-1">
            <span className="block font-semibold">Played against each other</span>
            <span className="block text-xs text-muted-foreground">
              {plural(against.length, "game")} with {friendName} on the other team
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
            None among the matches checked so far.
          </p>
        )}
      </details>

      {unknown > 0 && (
        <p className="text-xs text-muted-foreground">
          {sharedMatches(unknown)} couldn&apos;t be checked (match details unavailable or a player
          was anonymous), so {unknown === 1 ? "it isn't" : "they aren't"} counted anywhere.
        </p>
      )}
    </section>
  );
}
