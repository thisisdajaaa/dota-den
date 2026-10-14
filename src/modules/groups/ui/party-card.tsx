import { Info, Loader2, Users } from "lucide-react";
import { getT } from "@/common/i18n/server";
import { plural } from "@/common/i18n/translate";
import { StatTile } from "@/components/stat-tile";
import { formatAgo, formatPercent } from "@/modules/matches/ui/format";
import { PlayerAvatar } from "@/modules/players/ui/player-avatar";
import { MIN_LINEUP_GAMES, MIN_RATE_GAMES, rateOf } from "../domain/group-stats";
import type { GroupPartyDto } from "../dtos/responses/groups.dto";
import { memberName, type MemberLookup } from "./member-names";

const SIZE_KEYS = ["2", "3", "4", "5"] as const;

/** Record as a party, best lineups and recent games together: confirmed parties only. */
export async function PartyCard({
  party,
  members,
  now,
}: {
  party: GroupPartyDto;
  members: MemberLookup;
  now: Date;
}) {
  const t = await getT();
  const { stats } = party;
  const losses = stats.record.decided - stats.record.wins;
  const rate = rateOf({ games: stats.record.decided, wins: stats.record.wins });
  const enough = stats.record.decided >= MIN_RATE_GAMES;
  const sizeLabel = (n: number) => {
    const key = SIZE_KEYS.find((k) => Number(k) === n);
    return key ? t(`groups.party.sizes.${key}`) : String(n);
  };
  const people = (ids: number[]) => ids.map((id) => memberName(members, id)).join(", ");

  return (
    <div className="space-y-6">
      <section className="space-y-3" aria-labelledby="party-title">
        <div>
          <p className="kicker">{t("groups.party.kicker")}</p>
          <h2 id="party-title" className="text-lg font-semibold">
            {t("groups.party.title")}
          </h2>
          <p className="text-xs text-muted-foreground">{t("groups.party.description")}</p>
        </div>
        {(party.pairsUnchecked > 0 || party.upstreamBusy) && (
          <p
            role="status"
            className="panel flex items-start gap-2 p-4 text-sm text-muted-foreground"
          >
            <Loader2 aria-hidden className="mt-0.5 size-4 shrink-0 text-gold" />
            <span>
              {party.upstreamBusy
                ? t("groups.party.busy")
                : t("groups.party.pending", {
                    pairs: plural(t, "groups.units.pair", party.pairsUnchecked),
                    total: party.pairsTotal,
                  })}
            </span>
          </p>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatTile
            label={t("groups.party.games")}
            value={stats.record.games.toLocaleString("en-US")}
            detail={
              stats.lastPlayedAt
                ? t("groups.party.lastPlayed", { ago: formatAgo(stats.lastPlayedAt, now) })
                : t("groups.party.none")
            }
          />
          <StatTile
            label={t("groups.party.record")}
            value={`${stats.record.wins}–${losses}`}
            tone="gold"
          />
          <StatTile
            label={t("groups.party.winRate")}
            value={enough ? formatPercent(rate) : "–"}
            meter={enough ? rate : undefined}
            tone={rate !== null && rate >= 0.5 ? "win" : "loss"}
            detail={enough ? undefined : t("groups.party.fewGames", { n: MIN_RATE_GAMES })}
          />
        </div>
        {stats.unknownGames > 0 && (
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            <span>
              {t("groups.party.unknown", {
                games: plural(t, "groups.units.game", stats.unknownGames),
              })}
            </span>
          </p>
        )}
      </section>

      <section className="panel overflow-hidden" aria-labelledby="lineups-title">
        <div className="p-5 pb-3">
          <h2 id="lineups-title" className="text-lg font-semibold">
            {t("groups.party.lineupsTitle")}
          </h2>
          <p className="text-xs text-muted-foreground">
            {t("groups.party.lineupsDescription", { min: MIN_LINEUP_GAMES })}
          </p>
        </div>
        {stats.lineups.length === 0 ? (
          <div className="flex items-start gap-3 border-t border-white/[0.06] px-5 py-6 text-sm text-muted-foreground">
            <Users aria-hidden className="mt-0.5 size-5 shrink-0" />
            <p>{t("groups.party.lineupsNone", { min: MIN_LINEUP_GAMES })}</p>
          </div>
        ) : (
          <ol className="divide-y divide-white/[0.04] border-t border-white/[0.06]">
            {stats.lineups.map((l) => (
              <li key={l.members.join(":")} className="flex items-center gap-3 px-5 py-3">
                <span className="flex -space-x-2">
                  {l.members.map((id) => (
                    <PlayerAvatar
                      key={id}
                      url={members.get(id)?.avatarUrl ?? null}
                      name={memberName(members, id)}
                      size="sm"
                    />
                  ))}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{people(l.members)}</p>
                  <p className="text-xs text-muted-foreground">
                    {sizeLabel(l.members.length)} · {plural(t, "groups.units.game", l.games)} ·{" "}
                    <span className="text-win">{l.wins}W</span>{" "}
                    <span className="text-loss">{l.games - l.wins}L</span> ·{" "}
                    {formatPercent(rateOf(l))}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
        {stats.smallLineups > 0 && (
          <p className="border-t border-white/[0.06] px-5 py-3 text-xs text-muted-foreground">
            {t("groups.party.smallLineups", { n: stats.smallLineups, min: MIN_LINEUP_GAMES })}
          </p>
        )}
      </section>

      <section className="panel overflow-hidden" aria-labelledby="per-member-title">
        <div className="p-5 pb-3">
          <h2 id="per-member-title" className="text-lg font-semibold">
            {t("groups.party.perMember")}
          </h2>
        </div>
        <ul className="divide-y divide-white/[0.04] border-t border-white/[0.06]">
          {stats.members.map((m) => (
            <li
              key={m.accountId32}
              className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm"
            >
              <span className="truncate">{memberName(members, m.accountId32)}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {plural(t, "groups.units.partyGame", m.games)}
                {m.games > 0 && (
                  <>
                    {" · "}
                    <span className="text-win">{m.wins}W</span>{" "}
                    <span className="text-loss">{m.games - m.wins}L</span>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {party.recent.length > 0 && (
        <section className="panel overflow-hidden" aria-labelledby="recent-title">
          <div className="p-5 pb-3">
            <h2 id="recent-title" className="text-lg font-semibold">
              {t("groups.party.recentTitle")}
            </h2>
          </div>
          <ul className="divide-y divide-white/[0.04] border-t border-white/[0.06]">
            {party.recent.map((p) => (
              <li
                key={`${p.matchId}:${p.members.join(":")}`}
                className="flex items-center gap-3 px-5 py-2.5 text-sm"
              >
                <span
                  className={
                    p.result === "win"
                      ? "w-16 shrink-0 font-medium text-win"
                      : p.result === "loss"
                        ? "w-16 shrink-0 font-medium text-loss"
                        : "w-16 shrink-0 text-muted-foreground"
                  }
                >
                  {p.result === "win"
                    ? t("groups.party.win")
                    : p.result === "loss"
                      ? t("groups.party.loss")
                      : t("groups.party.unknownResult")}
                </span>
                <a
                  href={`/matches/${p.matchId}`}
                  className="min-w-0 flex-1 truncate hover:text-gold"
                >
                  {people(p.members)}
                </a>
                <span className="shrink-0 text-xs text-muted-foreground" suppressHydrationWarning>
                  {formatAgo(p.startedAt, now)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
