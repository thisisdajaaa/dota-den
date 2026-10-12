"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Radio } from "lucide-react";
import { apiRequest } from "@/common/http/api-client";
import { useT } from "@/common/i18n/client";
import { plural } from "@/common/i18n/translate";
import { PlayerAvatar } from "@/modules/players/ui/player-avatar";
import { REFRESH_SECONDS } from "../domain/presence";
import type { FriendsPlayingDto } from "../dtos/responses/friends-playing.dto";

export const FRIENDS_PLAYING_URL = "/api/v1/me/friends/playing";

/**
 * "Friends playing now" on the overview. Server-rendered first, then refreshed every minute
 * while the tab is visible (and right away when it becomes visible again). Renders nothing
 * when nobody is playing or Steam isn't configured.
 */
export function FriendsPlayingStrip({
  initial,
  refreshSeconds = REFRESH_SECONDS,
}: {
  initial: FriendsPlayingDto;
  refreshSeconds?: number;
}) {
  const t = useT();
  const [data, setData] = useState(initial);
  // When the shown data was fetched (the server render counts as a fetch).
  const lastFetch = useRef(0);

  useEffect(() => {
    if (!initial.enabled) return;
    lastFetch.current = Date.now();
    let cancelled = false;
    let inFlight: AbortController | null = null;
    const refresh = async () => {
      if (document.visibilityState !== "visible" || inFlight) return;
      inFlight = new AbortController();
      lastFetch.current = Date.now();
      try {
        const next = await apiRequest<FriendsPlayingDto>(FRIENDS_PLAYING_URL, {
          signal: inFlight.signal,
          cache: "no-store",
        });
        if (!cancelled) setData(next);
      } catch {
        // No guessing: if we can't confirm who is playing, show nobody.
        if (!cancelled) setData((d) => ({ ...d, friends: [] }));
      } finally {
        inFlight = null;
      }
    };
    const id = setInterval(refresh, refreshSeconds * 1000);
    const onVisible = () => {
      if (Date.now() - lastFetch.current >= refreshSeconds * 1000) void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      inFlight?.abort();
    };
  }, [initial.enabled, refreshSeconds]);

  if (!data.enabled || data.friends.length === 0) return null;

  return (
    <section className="panel space-y-3 p-4" aria-labelledby="friends-playing-title">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2
          id="friends-playing-title"
          className="flex items-center gap-2 text-sm font-semibold tracking-wide"
        >
          <Radio aria-hidden className="size-4 text-win" />
          {t("presence.title")}
        </h2>
        <p className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
          {plural(t, "presence.count", data.friends.length)}
        </p>
      </div>
      <ul className="flex gap-2 overflow-x-auto pb-1">
        {data.friends.map((f) => {
          const name = f.name ?? t("presence.unknownName", { id: f.accountId32 });
          const status = t(f.status === "in_match" ? "presence.inMatch" : "presence.inGame");
          const action = t(f.live ? "presence.watchLive" : "presence.viewProfile");
          return (
            <li key={f.accountId32} className="shrink-0">
              <Link
                href={f.href}
                aria-label={t("presence.link", { name, status, action })}
                className="flex max-w-56 items-center gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] py-1.5 pr-3 pl-1.5 transition-colors hover:border-gold/30 focus-visible:ring-2 focus-visible:ring-gold/50 focus-visible:outline-none"
              >
                <PlayerAvatar url={f.avatarUrl} name={name} size="sm" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{name}</span>
                  <span
                    className={
                      f.status === "in_match"
                        ? "block text-xs text-win"
                        : "block text-xs text-muted-foreground"
                    }
                  >
                    {status}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {data.source && (
        <p className="text-xs text-muted-foreground">{t(`presence.source.${data.source}`)}</p>
      )}
    </section>
  );
}
