"use client";

import { useState } from "react";
import { ExternalLink, Play, Search, Tv, X } from "lucide-react";
import { cn } from "cn";
import { useT } from "@/common/i18n/client";
import { Button } from "@/components/ui/button";
import type { SearchLink, StreamMatch } from "../domain/watch";
import { channelKey, channelUrl, embedUrls, PLATFORM_NAMES } from "../domain/platform";
import { useEmbedHost } from "./embed";
import { PlatformBadge } from "./platform-badge";

/**
 * Where to watch a live game. With Twitch configured: streams whose titles mention the game,
 * played in the page on request. Always: searches on Twitch and YouTube.
 */
export function WatchSection({
  streams,
  links,
}: {
  streams: StreamMatch[] | null;
  links: SearchLink[];
}) {
  const t = useT();
  const [playing, setPlaying] = useState<string | null>(null);
  // Twitch only plays inside pages it's told about, so the embed names this page's host.
  const host = useEmbedHost();
  // The search query is in the link itself; the label is rebuilt in the viewer's language.
  const linkLabel = (l: SearchLink) => {
    const url = new URL(l.href);
    const query = url.searchParams.get(l.site === "Twitch" ? "term" : "search_query");
    if (!query) return l.label;
    return t(l.site === "Twitch" ? "live.watch.searchTwitch" : "live.watch.searchYouTube", {
      query,
    });
  };
  const keyOf = (s: StreamMatch) => channelKey(s.platform, s.channel);
  const current = streams?.find((s) => keyOf(s) === playing) ?? null;
  if (!streams?.length && links.length === 0) return null;

  return (
    <section aria-labelledby="watch-title" className="panel space-y-4 p-5">
      <div>
        <h2 id="watch-title" className="flex items-center gap-2 text-lg font-semibold">
          <Tv aria-hidden className="size-5 text-gold" /> {t("live.watch.title")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {streams?.length
            ? t("live.watch.streams")
            : streams
              ? t("live.watch.noStreams")
              : t("live.watch.searchOnly")}
        </p>
      </div>

      {current && host && (
        <div className="space-y-2">
          <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black ring-1 ring-white/10">
            <iframe
              title={t("live.watch.playerTitle", {
                name: current.displayName,
                platform: PLATFORM_NAMES[current.platform],
              })}
              src={embedUrls(current.platform, current.channel, host).player}
              allowFullScreen
              allow="autoplay; fullscreen"
              className="absolute inset-0 size-full"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <a
              href={channelUrl(current.platform, current.channel)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-gold hover:underline"
            >
              {t("live.watch.open", {
                name: current.displayName,
                platform: PLATFORM_NAMES[current.platform],
              })}{" "}
              <ExternalLink aria-hidden className="size-3.5" />
            </a>
            <Button variant="ghost" size="sm" onClick={() => setPlaying(null)}>
              <X aria-hidden /> {t("live.watch.close")}
            </Button>
          </div>
        </div>
      )}

      {!!streams?.length && (
        <ul className="divide-y divide-white/[0.05] overflow-hidden rounded-lg border border-white/[0.06]">
          {streams.map((s) => (
            <li
              key={keyOf(s)}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5",
                keyOf(s) === playing && "bg-white/[0.04]",
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  <PlatformBadge platform={s.platform} className="mr-1.5 align-middle" />
                  {s.displayName}{" "}
                  <span className="font-normal text-muted-foreground">
                    {t("live.watch.viewers", {
                      n: s.viewers.toLocaleString("en-US"),
                      lang: s.language.toUpperCase(),
                    })}
                  </span>
                </p>
                <p className="truncate text-xs text-muted-foreground">{s.title}</p>
              </div>
              <Button
                size="sm"
                variant={keyOf(s) === playing ? "secondary" : "outline"}
                disabled={keyOf(s) === playing}
                aria-label={t("live.watch.watchHere", { name: s.displayName })}
                onClick={() => setPlaying(keyOf(s))}
              >
                <Play aria-hidden />{" "}
                {keyOf(s) === playing ? t("live.watch.playing") : t("live.watch.watch")}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {links.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {links.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-sm hover:border-gold/40 hover:text-gold"
              >
                <Search aria-hidden className="size-3.5" /> {linkLabel(l)}
              </a>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">{t("live.watch.clientHint")}</p>
    </section>
  );
}
