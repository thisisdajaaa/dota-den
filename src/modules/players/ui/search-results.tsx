import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getT } from "@/common/i18n/server";
import { plural } from "@/common/i18n/translate";
import { formatAgo } from "@/modules/matches/ui/format";
import type { PlayerSearchHit } from "../domain/public-player";
import { displayName, PlayerAvatar } from "./player-avatar";

export async function SearchResults({
  q,
  hits,
  now,
}: {
  q: string;
  hits: PlayerSearchHit[];
  now: Date;
}) {
  const t = await getT();
  return (
    <section className="panel overflow-hidden" aria-labelledby="search-results">
      <div className="p-5 pb-3">
        <p className="kicker">{t("players.results.kicker")}</p>
        <h2 id="search-results" className="text-lg font-semibold">
          {t("players.results.title", { q })}
        </h2>
        <p className="text-xs text-muted-foreground">
          {t("players.results.found", { players: plural(t, "players.units.player", hits.length) })}
        </p>
      </div>
      <ul className="divide-y divide-white/[0.04] border-t border-white/[0.06]">
        {hits.map((h) => {
          const name = displayName(h.personaName, h.accountId32);
          const played = h.lastMatchAt
            ? t("players.results.lastPlayed", { ago: formatAgo(h.lastMatchAt, now) })
            : null;
          return (
            <li key={h.accountId32}>
              <Link
                href={`/players/${h.accountId32}`}
                className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-white/[0.03] focus-visible:bg-white/[0.04] focus-visible:outline-none"
              >
                <PlayerAvatar url={h.avatarUrl} name={name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{name}</span>
                  <span className="block text-xs text-muted-foreground">
                    <span className="font-mono">
                      {t("players.results.account", { id: h.accountId32 })}
                    </span>
                    {played && (
                      <>
                        {" · "}
                        <time dateTime={h.lastMatchAt!.toISOString()}>{played}</time>
                      </>
                    )}
                  </span>
                </span>
                <ChevronRight
                  aria-hidden
                  className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-gold"
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
