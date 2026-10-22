"use client";

import { useState, type Ref } from "react";
import { ExternalLink, Eye, Loader2, MessageSquare, X } from "lucide-react";
import { cn } from "cn";
import { useT } from "@/common/i18n/client";
import { channelUrl, embedUrls, PLATFORM_NAMES, type Platform } from "../domain/platform";
import { compactCount } from "../domain/streams";
import type { StreamGameHint } from "../domain/watch";
import { ChannelAvatar } from "./channel-avatar";
import { GameHint } from "./game-hint";
import { useEmbedHost, useMediaQuery } from "./embed";
import { PlatformBadge } from "./platform-badge";

/** What the hub knows about the channel being played (at least its login). */
export interface NowPlaying {
  platform: Platform;
  login: string;
  displayName: string;
  title?: string | null;
  viewers?: number | null;
  language?: string | null;
  avatarUrl?: string | null;
  gameName?: string | null;
}

/**
 * The site's player, with the channel's chat beside it (below on phones, where it starts
 * collapsed) when the site has a chat embed (Twitch); otherwise a link to the chat (Kick).
 * Mount it with `key={platform:login}`: its iframes then only load when the channel changes,
 * never when the page refreshes its data.
 */
export function StreamPlayer({
  now,
  hint,
  follow,
  onClose,
  headingRef,
  languageName,
}: {
  now: NowPlaying;
  hint?: StreamGameHint;
  follow?: React.ReactNode;
  onClose: () => void;
  headingRef?: Ref<HTMLHeadingElement>;
  languageName: (code: string) => string;
}) {
  const t = useT();
  const host = useEmbedHost();
  const wide = useMediaQuery("(min-width: 1024px)");
  const [chatChoice, setChatChoice] = useState<boolean | null>(null);
  const site = PLATFORM_NAMES[now.platform];
  const embeds = host ? embedUrls(now.platform, now.login, host) : null;
  // Sites without a chat embed (Kick) get a link instead of a chat column.
  const hasChat = now.platform === "twitch";
  const chatOpen = hasChat && (chatChoice ?? wide);
  // Load the chat on first open, then keep it (hidden) so reopening keeps its scrollback.
  const [chatLoaded, setChatLoaded] = useState(false);
  if (chatOpen && !chatLoaded) setChatLoaded(true);
  const chatId = `chat-${now.platform}-${now.login}`;

  return (
    <section
      aria-labelledby="player-title"
      className="panel overflow-hidden p-0 ring-1 ring-gold/20"
    >
      <div className={cn("grid grid-cols-1", chatOpen && "lg:grid-cols-[minmax(0,1fr)_22rem]")}>
        <div className="relative aspect-video w-full bg-black">
          {embeds ? (
            <iframe
              title={t("live.watch.playerTitle", { name: now.displayName, platform: site })}
              src={embeds.player}
              allowFullScreen
              allow="autoplay; fullscreen; picture-in-picture"
              className="absolute inset-0 size-full"
            />
          ) : (
            <div
              role="status"
              className="absolute inset-0 grid place-items-center text-sm text-muted-foreground"
            >
              <span className="inline-flex items-center gap-2">
                <Loader2 aria-hidden className="size-4 animate-spin" />
                {t("live.hub.player.loading")}
              </span>
            </div>
          )}
        </div>
        {hasChat && (
          <div
            id={chatId}
            hidden={!chatOpen}
            className="relative h-[26rem] border-t border-white/[0.06] bg-black/40 lg:h-auto lg:min-h-[20rem] lg:border-t-0 lg:border-l"
          >
            {chatLoaded && embeds?.chat && (
              <iframe
                title={t("live.hub.player.chatTitle", { name: now.displayName, platform: site })}
                src={embeds.chat}
                className="absolute inset-0 size-full"
              />
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 gap-3">
          <ChannelAvatar url={now.avatarUrl} name={now.displayName} size="md" live />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="flex items-center gap-2">
              <span className="kicker">{t("live.hub.player.region")}</span>
              <PlatformBadge platform={now.platform} />
            </p>
            <h2
              id="player-title"
              ref={headingRef}
              tabIndex={-1}
              className="truncate text-lg font-semibold outline-none"
            >
              {now.displayName}
            </h2>
            {now.title && (
              <p className="line-clamp-2 text-sm break-words text-muted-foreground">{now.title}</p>
            )}
            {(now.viewers != null || now.language || now.gameName) && (
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                {now.viewers != null && (
                  <span className="inline-flex items-center gap-1 tabular-nums">
                    <Eye aria-hidden className="size-3.5" />
                    {t("live.hub.card.viewers", { n: compactCount(now.viewers) })}
                  </span>
                )}
                {now.language && <span>{languageName(now.language)}</span>}
                {now.gameName && <span>{now.gameName}</span>}
              </p>
            )}
            {hint && <GameHint hint={hint} className="pt-1" />}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {follow}
          {hasChat ? (
            <button
              type="button"
              aria-expanded={chatOpen}
              aria-controls={chatId}
              onClick={() => setChatChoice(!chatOpen)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium ring-1 ring-white/10 transition-colors outline-none hover:bg-white/[0.05] focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <MessageSquare aria-hidden className="size-3.5" />
              {chatOpen ? t("live.hub.player.hideChat") : t("live.hub.player.showChat")}
            </button>
          ) : (
            <a
              href={channelUrl(now.platform, now.login)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium ring-1 ring-white/10 transition-colors outline-none hover:bg-white/[0.05] focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <MessageSquare aria-hidden className="size-3.5" />
              {t("live.hub.player.openChat", { platform: site })}
            </a>
          )}
          <a
            href={channelUrl(now.platform, now.login)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-gold ring-1 ring-gold/25 transition-colors outline-none hover:bg-gold/10 focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {t("live.hub.player.open", { platform: site })}{" "}
            <ExternalLink aria-hidden className="size-3.5" />
          </a>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("live.hub.player.close")}
            title={t("live.hub.player.close")}
            className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground ring-1 ring-white/10 transition-colors outline-none hover:bg-white/[0.05] hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
      </div>
    </section>
  );
}
