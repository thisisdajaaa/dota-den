"use client";

import { useId } from "react";
import { Eye, Play } from "lucide-react";
import { cn } from "cn";
import { useT } from "@/common/i18n/client";
import { compactCount, thumbnail } from "../domain/streams";
import type { LiveStream, StreamGameHint } from "../domain/watch";
import { ChannelAvatar } from "./channel-avatar";
import { GameHint } from "./game-hint";
import { PlatformBadge } from "./platform-badge";
import { useImageFailed } from "./use-image-failed";
import { languageCode } from "../domain/streams";

/**
 * One live stream in the grid (from any site, badged): a preview that plays it in the page,
 * plus its game guess.
 */
export function StreamCard({
  stream,
  hint,
  playing,
  languageName,
  onWatch,
  follow,
}: {
  stream: LiveStream;
  hint: StreamGameHint | undefined;
  playing: boolean;
  languageName: string;
  onWatch: () => void;
  /** The follow control, for signed-in viewers. */
  follow?: React.ReactNode;
}) {
  const t = useT();
  const titleId = useId();
  const { failed: imageFailed, onError: onImageError, check: checkImage } = useImageFailed();
  const preview = thumbnail(stream.thumbnailUrl, 440, 248);
  return (
    <li className="min-w-0">
      <article
        className={cn(
          "group/card flex h-full flex-col overflow-hidden rounded-xl border bg-card/70 transition-colors",
          playing
            ? "border-gold/50 ring-1 ring-gold/30"
            : "border-white/[0.07] hover:border-gold/30",
        )}
      >
        <button
          type="button"
          onClick={onWatch}
          aria-label={t("live.hub.card.watch", { name: stream.displayName })}
          aria-describedby={titleId}
          aria-current={playing ? "true" : undefined}
          className="block w-full text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
        >
          <div className="relative aspect-video overflow-hidden bg-gradient-to-br from-white/[0.06] to-black/40">
            {preview && !imageFailed ? (
              // eslint-disable-next-line @next/next/no-img-element -- Twitch or Kick CDN preview, already sized
              <img
                src={preview}
                alt=""
                loading="lazy"
                decoding="async"
                ref={checkImage}
                onError={onImageError}
                className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover/card:scale-[1.03]"
              />
            ) : (
              <span
                aria-hidden
                className="absolute inset-0 grid place-items-center font-display text-3xl font-bold text-gold/40"
              >
                {stream.displayName.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="absolute top-2 left-2 rounded bg-loss px-1.5 py-0.5 text-[0.65rem] font-bold tracking-wider text-white uppercase">
              {t("live.hub.card.live")}
            </span>
            <span className="absolute top-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[0.65rem] font-semibold text-white/90 uppercase">
              <span className="sr-only">{languageName}</span>
              <span aria-hidden>{stream.language ? languageCode(stream.language) : "—"}</span>
            </span>
            <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-xs font-medium text-white tabular-nums">
              <Eye aria-hidden className="size-3.5" />
              {t("live.hub.card.viewers", { n: compactCount(stream.viewers) })}
            </span>
            <PlatformBadge platform={stream.platform} className="absolute right-2 bottom-2" />
            <span
              aria-hidden
              className={cn(
                "absolute inset-0 grid place-items-center bg-black/40 transition-opacity",
                playing ? "opacity-100" : "opacity-0 group-hover/card:opacity-100",
              )}
            >
              {playing ? (
                <span className="rounded-full bg-gold px-3 py-1 text-xs font-semibold text-black">
                  {t("live.hub.card.playing")}
                </span>
              ) : (
                <span className="grid size-12 place-items-center rounded-full bg-gold/90 text-black shadow-lg">
                  <Play className="size-5 translate-x-px fill-current" />
                </span>
              )}
            </span>
          </div>
          <div className="flex gap-3 p-3">
            <ChannelAvatar url={stream.avatarUrl} name={stream.displayName} />
            <div className="min-w-0">
              <p id={titleId} className="line-clamp-2 text-sm leading-snug font-medium break-words">
                {stream.title || stream.displayName}
              </p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{stream.displayName}</p>
            </div>
          </div>
        </button>
        {(hint || follow) && (
          <div className="mt-auto flex items-end gap-2 px-3 pb-3">
            {hint ? <GameHint hint={hint} className="flex-1" /> : <span className="flex-1" />}
            {follow}
          </div>
        )}
      </article>
    </li>
  );
}
