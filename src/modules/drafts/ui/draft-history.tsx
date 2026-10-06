import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Eye, Radio, UserRound } from "lucide-react";
import { cn } from "cn";
import { getT } from "@/common/i18n/server";
import { plural } from "@/common/i18n/translate";
import { LocalTime } from "@/components/local-time";
import type { HistoryOpponent } from "../draft-history.ports";
import type {
  HeadToHeadView,
  HistoryEntryView,
  HistoryPageView,
  PublicCaptain,
} from "../dtos/responses/history-views.dto";
import type { HeroCount, ReportedWinner } from "../domain/draft-history";
import type { Side } from "../domain/draft-state";
import { rulesetName, sideName, type T } from "./i18n";
import type { DraftHero } from "./types";

const WINNER: Record<ReportedWinner, "radiantWon" | "direWon" | "notPlayed"> = {
  radiant: "radiantWon",
  dire: "direWon",
  not_played: "notPlayed",
};

export function historyHref(opts: { friend?: number | null; page?: number }): string {
  const params = new URLSearchParams();
  if (opts.friend) params.set("friend", String(opts.friend));
  if (opts.page && opts.page > 1) params.set("page", String(opts.page));
  const qs = params.toString();
  return `/draft/rooms/history${qs ? `?${qs}` : ""}`;
}

function Avatar({ captain, size = 40 }: { captain: PublicCaptain; size?: number }) {
  return (
    <span
      className="relative grid shrink-0 place-items-center overflow-hidden rounded-lg bg-muted ring-1 ring-white/10"
      style={{ width: size, height: size }}
    >
      {captain.avatarUrl ? (
        <Image
          src={captain.avatarUrl}
          alt=""
          width={size}
          height={size}
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <UserRound aria-hidden className="size-1/2 text-muted-foreground" />
      )}
    </span>
  );
}

function HeroThumb({
  t,
  hero,
  heroId,
  banned = false,
}: {
  t: T;
  hero: DraftHero | undefined;
  heroId: number;
  banned?: boolean;
}) {
  const name = hero?.name ?? t("drafts.history.hero", { id: heroId });
  return (
    <span
      title={banned ? t("drafts.history.banned", { hero: name }) : name}
      className={cn(
        "relative inline-block h-7 w-[3.1rem] shrink-0 overflow-hidden rounded bg-muted ring-1 ring-white/10",
        banned && "opacity-50 grayscale",
      )}
    >
      {hero?.imageUrl ? (
        <Image
          src={hero.imageUrl}
          alt={name}
          width={56}
          height={32}
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <span className="grid h-full place-items-center px-0.5 text-center text-[0.5rem] leading-tight text-muted-foreground">
          {name}
        </span>
      )}
    </span>
  );
}

function Lineup({
  t,
  label,
  side,
  picks,
  bans,
  heroes,
}: {
  t: T;
  label: string;
  side: Side;
  picks: number[];
  bans: number[];
  heroes: Map<number, DraftHero>;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <p className={cn("text-xs font-medium", side === "radiant" ? "text-win" : "text-loss")}>
        {label}
      </p>
      <div className="flex flex-wrap gap-1" aria-label={t("drafts.history.picks", { label })}>
        {picks.map((id) => (
          <HeroThumb key={id} t={t} hero={heroes.get(id)} heroId={id} />
        ))}
      </div>
      {bans.length > 0 && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none">
            {plural(t, "drafts.history.bans", bans.length)}
          </summary>
          <div className="mt-1 flex flex-wrap gap-1">
            {bans.map((id) => (
              <HeroThumb key={id} t={t} hero={heroes.get(id)} heroId={id} banned />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function ResultBadge({ t, entry }: { t: T; entry: HistoryEntryView }) {
  const r = entry.result;
  if (!r) {
    return <span className="text-xs text-muted-foreground">{t("drafts.history.noResult")}</span>;
  }
  const tone =
    r.outcome === "won"
      ? "border-win/40 bg-win/10 text-win"
      : r.outcome === "lost"
        ? "border-loss/40 bg-loss/10 text-loss"
        : "border-white/15 bg-white/[0.04] text-muted-foreground";
  const text =
    r.outcome === "won"
      ? t("drafts.history.youWon")
      : r.outcome === "lost"
        ? t("drafts.history.youLost")
        : t("drafts.history.notPlayed");
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className={cn("rounded border px-1.5 py-0.5 font-medium", tone)}>{text}</span>
      <span className="text-muted-foreground">
        {r.winner !== "not_played" && `${t(`drafts.history.${WINNER[r.winner]}`)} · `}
        {t("drafts.history.selfReported", {
          who: r.setByYou ? t("drafts.history.you") : r.setByName,
        })}
      </span>
    </span>
  );
}

function HistoryRow({
  t,
  entry,
  heroes,
}: {
  t: T;
  entry: HistoryEntryView;
  heroes: Map<number, DraftHero>;
}) {
  const theirSide: Side = entry.yourSide === "radiant" ? "dire" : "radiant";
  return (
    <li
      className="space-y-3 px-4 py-4 sm:px-5"
      aria-label={t("drafts.history.against", { name: entry.opponent.name })}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar captain={entry.opponent} />
          <div className="min-w-0">
            <p className="truncate font-medium">
              {t("drafts.history.vs", { name: entry.opponent.name })}
              {entry.isRematch && (
                <span className="ml-2 rounded bg-white/[0.06] px-1.5 text-xs text-muted-foreground">
                  {t("drafts.history.rematch")}
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("drafts.history.youWere")}{" "}
              <span className={entry.yourSide === "radiant" ? "text-win" : "text-loss"}>
                {sideName(t, entry.yourSide)}
              </span>
              {" · "}
              {rulesetName(t, { id: entry.rulesetId, name: entry.rulesetName })}
              {" · "}
              <LocalTime iso={entry.completedAt} />
            </p>
          </div>
        </div>
        <ResultBadge t={t} entry={entry} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Lineup
          t={t}
          label={t("drafts.history.youSide", { side: sideName(t, entry.yourSide) })}
          side={entry.yourSide}
          picks={entry.sides[entry.yourSide].picks}
          bans={entry.sides[entry.yourSide].bans}
          heroes={heroes}
        />
        <Lineup
          t={t}
          label={t("drafts.history.theirSide", {
            name: entry.opponent.name,
            side: sideName(t, theirSide),
          })}
          side={theirSide}
          picks={entry.sides[theirSide].picks}
          bans={entry.sides[theirSide].bans}
          heroes={heroes}
        />
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <Link
          href={`/draft?snapshot=${entry.snapshot}`}
          className="inline-flex items-center gap-1.5 text-gold hover:underline"
        >
          <Eye aria-hidden className="size-3.5" /> {t("drafts.history.view")}
        </Link>
        {entry.roomAvailable && (
          <Link
            href={`/draft/rooms/${entry.roomId}`}
            className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <Radio aria-hidden className="size-3.5" /> {t("drafts.history.openRoom")}
          </Link>
        )}
      </div>
    </li>
  );
}

export async function HistoryList({
  page,
  heroes,
  friend,
}: {
  page: HistoryPageView;
  heroes: Map<number, DraftHero>;
  friend: number | null;
}) {
  const t = await getT();
  return (
    <section className="panel overflow-hidden" aria-label={t("drafts.history.listLabel")}>
      <ol className="divide-y divide-white/[0.06]">
        {page.items.map((e) => (
          <HistoryRow key={e.roomId} t={t} entry={e} heroes={heroes} />
        ))}
      </ol>
      <div className="flex items-center justify-between border-t border-white/[0.06] px-5 py-3 text-sm">
        {page.page > 1 ? (
          <Link
            href={historyHref({ friend, page: page.page - 1 })}
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft aria-hidden className="size-4" /> {t("drafts.history.newer")}
          </Link>
        ) : (
          <span className="text-xs text-muted-foreground">{t("drafts.history.newestFirst")}</span>
        )}
        <span className="text-xs text-muted-foreground">
          {t("drafts.history.page", { page: page.page, count: page.pageCount })}
        </span>
        {page.page < page.pageCount ? (
          <Link
            href={historyHref({ friend, page: page.page + 1 })}
            className="inline-flex items-center gap-1 font-medium text-gold hover:underline"
          >
            {t("drafts.history.older")} <ChevronRight aria-hidden className="size-4" />
          </Link>
        ) : (
          <span />
        )}
      </div>
    </section>
  );
}

export async function FriendFilter({
  opponents,
  active,
}: {
  opponents: HistoryOpponent[];
  active: number | null;
}) {
  const t = await getT();
  const chip = (isActive: boolean) =>
    cn(
      "inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
      isActive
        ? "bg-gold/15 text-gold shadow-[inset_0_0_0_1px_oklch(0.8_0.13_80/0.3)]"
        : "text-muted-foreground hover:text-foreground",
    );
  return (
    <nav
      aria-label={t("drafts.history.filter")}
      className="flex max-w-full flex-wrap gap-0.5 rounded-lg border border-white/[0.07] bg-card/60 p-0.5"
    >
      <Link
        href={historyHref({})}
        aria-current={active === null ? "page" : undefined}
        className={chip(active === null)}
      >
        {t("drafts.history.everyone")}
      </Link>
      {opponents.map((o) => (
        <Link
          key={o.accountId32}
          href={historyHref({ friend: o.accountId32 })}
          aria-current={active === o.accountId32 ? "page" : undefined}
          className={chip(active === o.accountId32)}
        >
          <Avatar captain={o} size={18} />
          {o.name}
          <span className="text-muted-foreground">{o.drafts}</span>
        </Link>
      ))}
    </nav>
  );
}

function HeroCounts({
  t,
  title,
  counts,
  heroes,
  empty,
}: {
  t: T;
  title: string;
  counts: HeroCount[];
  heroes: Map<number, DraftHero>;
  empty: string;
}) {
  return (
    <div className="space-y-2">
      <h3 className="kicker">{title}</h3>
      {counts.length === 0 ? (
        <p className="text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ol className="space-y-1.5">
          {counts.map((c) => (
            <li key={c.heroId} className="flex items-center gap-2 text-sm">
              <HeroThumb t={t} hero={heroes.get(c.heroId)} heroId={c.heroId} />
              <span className="min-w-0 flex-1 truncate">
                {heroes.get(c.heroId)?.name ?? t("drafts.history.hero", { id: c.heroId })}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">× {c.count}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export async function HeadToHeadSummary({
  summary,
  heroes,
}: {
  summary: HeadToHeadView;
  heroes: Map<number, DraftHero>;
}) {
  const t = await getT();
  const reported = summary.wins + summary.losses;
  const notes = [
    summary.unreported > 0 && plural(t, "drafts.history.unreported", summary.unreported),
    summary.notPlayed > 0 && t("drafts.history.notPlayedCount", { n: summary.notPlayed }),
  ].filter(Boolean);
  return (
    <section className="panel space-y-5 p-5" aria-label={t("drafts.history.h2hLabel")}>
      <div className="flex flex-wrap items-center gap-4">
        <Avatar captain={summary.friend} size={48} />
        <div className="min-w-0">
          <p className="kicker">{t("drafts.history.h2h")}</p>
          <h2 className="truncate text-xl font-semibold">
            {t("drafts.history.youVs", { name: summary.friend.name })}
          </h2>
        </div>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-8 gap-y-3">
        <div>
          <div className="kicker">{t("drafts.history.together")}</div>
          <div className="text-2xl font-semibold sm:text-3xl">{summary.drafts}</div>
        </div>
        <div>
          <div className="kicker">{t("drafts.history.record")}</div>
          <div className="text-2xl font-semibold whitespace-nowrap sm:text-3xl">
            {reported === 0 ? (
              <span className="text-muted-foreground">{t("drafts.history.noResults")}</span>
            ) : (
              <>
                <span className="text-win">{summary.wins}</span>
                <span className="text-muted-foreground"> – </span>
                <span className="text-loss">{summary.losses}</span>
              </>
            )}
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {t("drafts.history.recordNote", { games: plural(t, "drafts.history.games", reported) })}
        {notes.length > 0
          ? t("drafts.history.notCounted", { notes: notes.join(", ") })
          : t("drafts.history.period")}
        {summary.truncated && t("drafts.history.truncated")}
      </p>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <HeroCounts
          t={t}
          title={t("drafts.history.yourPicks")}
          counts={summary.yourPicks}
          heroes={heroes}
          empty={t("drafts.history.noPicks")}
        />
        <HeroCounts
          t={t}
          title={t("drafts.history.friendPicks", { name: summary.friend.name })}
          counts={summary.friendPicks}
          heroes={heroes}
          empty={t("drafts.history.noPicks")}
        />
        <HeroCounts
          t={t}
          title={t("drafts.history.bannedAgainst")}
          counts={summary.bannedAgainstYou}
          heroes={heroes}
          empty={t("drafts.history.noBans")}
        />
      </div>
    </section>
  );
}
