"use client";

import { ExternalLink, Heart, LogIn, X } from "lucide-react";
import { cn } from "cn";
import { useT } from "@/common/i18n/client";
import { channelKey, channelUrl, PLATFORM_NAMES } from "../domain/platform";
import { compactCount, type FollowedChannel } from "../domain/streams";
import { ChannelAvatar } from "./channel-avatar";
import { PlatformBadge } from "./platform-badge";

/** The channels a signed-in viewer follows, live ones first. */
export function FollowingRow({
  channels,
  failed,
  watching,
  busy,
  onWatch,
  onUnfollow,
}: {
  channels: FollowedChannel[];
  /** The list couldn't be loaded. */
  failed: boolean;
  /** `channelKey` of the channel playing, if any. */
  watching: string | null;
  /** `platform:channelId` of follows with a request in flight. */
  busy: ReadonlySet<string>;
  onWatch: (channel: FollowedChannel) => void;
  onUnfollow: (channel: FollowedChannel) => void;
}) {
  const t = useT();
  const live = channels.filter((c) => c.status === "live").length;
  return (
    <section aria-labelledby="following-title" className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="following-title" className="flex items-center gap-2 text-lg font-semibold">
          <Heart aria-hidden className="size-5 text-gold" /> {t("live.hub.following.title")}
        </h2>
        {live > 0 && (
          <p className="inline-flex items-center gap-1.5 text-xs font-medium text-loss">
            <span aria-hidden className="size-2 animate-pulse rounded-full bg-loss" />
            {t("live.hub.following.liveCount", { n: live })}
          </p>
        )}
      </div>
      {failed ? (
        <p role="alert" className="panel p-4 text-sm text-muted-foreground">
          {t("live.hub.following.unavailable")}
        </p>
      ) : channels.length === 0 ? (
        <p className="panel p-4 text-sm text-muted-foreground">{t("live.hub.following.empty")}</p>
      ) : (
        <ul className="flex snap-x [scrollbar-width:thin] gap-3 overflow-x-auto pb-2">
          {channels.map((c) => (
            <FollowedTile
              key={`${c.platform}:${c.channelId}`}
              channel={c}
              playing={watching === channelKey(c.platform, c.login)}
              busy={busy.has(`${c.platform}:${c.channelId}`)}
              onWatch={() => onWatch(c)}
              onUnfollow={() => onUnfollow(c)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function FollowedTile({
  channel: c,
  playing,
  busy,
  onWatch,
  onUnfollow,
}: {
  channel: FollowedChannel;
  playing: boolean;
  busy: boolean;
  onWatch: () => void;
  onUnfollow: () => void;
}) {
  const t = useT();
  const isLive = c.status === "live" && c.stream;
  const body = (
    <>
      <ChannelAvatar
        url={c.avatarUrl}
        name={c.displayName}
        size="md"
        live={!!isLive}
        className={cn(!isLive && "opacity-60 grayscale")}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{c.displayName}</span>
        {isLive ? (
          <>
            <span className="flex items-center gap-1 text-xs font-medium text-loss">
              <PlatformBadge platform={c.platform} className="mr-0.5" />
              {t("live.hub.card.live")}
              <span className="text-muted-foreground tabular-nums">
                · {t("live.hub.card.viewers", { n: compactCount(c.stream!.viewers) })}
              </span>
            </span>
            <span className="block truncate text-xs text-muted-foreground">{c.stream!.title}</span>
          </>
        ) : (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <PlatformBadge platform={c.platform} className="mr-0.5" />
            {c.status === "offline"
              ? t("live.hub.following.offline")
              : t("live.hub.following.unknown")}
            <ExternalLink aria-hidden className="size-3" />
          </span>
        )}
      </span>
    </>
  );
  const tile = cn(
    "flex w-full items-center gap-3 rounded-xl border p-3 pr-9 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
    playing
      ? "border-gold/50 bg-gold/[0.06]"
      : isLive
        ? "border-loss/30 bg-card/80 hover:border-loss/60"
        : "border-white/[0.07] bg-card/60 hover:border-white/20",
  );
  return (
    <li className="relative w-60 shrink-0 snap-start">
      {isLive ? (
        <button
          type="button"
          onClick={onWatch}
          aria-label={t("live.hub.following.watch", { name: c.displayName })}
          aria-current={playing ? "true" : undefined}
          className={tile}
        >
          {body}
        </button>
      ) : (
        <a
          href={channelUrl(c.platform, c.login)}
          target="_blank"
          rel="noreferrer"
          aria-label={
            c.status === "offline"
              ? t("live.hub.following.openOffline", {
                  name: c.displayName,
                  platform: PLATFORM_NAMES[c.platform],
                })
              : t("live.hub.search.openLabel", {
                  name: c.displayName,
                  platform: PLATFORM_NAMES[c.platform],
                })
          }
          className={tile}
        >
          {body}
        </a>
      )}
      <button
        type="button"
        onClick={onUnfollow}
        disabled={busy}
        aria-label={t("live.hub.follow.labelUnfollow", { name: c.displayName })}
        title={t("live.hub.follow.labelUnfollow", { name: c.displayName })}
        className="absolute top-2 right-2 grid size-6 place-items-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-white/[0.08] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
      >
        <X aria-hidden className="size-3.5" />
      </button>
    </li>
  );
}

/** For guests: what following does, and a way to sign in. */
export function FollowSignInPrompt() {
  const t = useT();
  return (
    <section
      aria-labelledby="following-title"
      className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
    >
      <div className="flex gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-gold/10 text-gold ring-1 ring-gold/25">
          <Heart aria-hidden className="size-5" />
        </span>
        <div>
          <h2 id="following-title" className="font-semibold">
            {t("live.hub.following.signInTitle")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("live.hub.following.signInBody")}</p>
        </div>
      </div>
      <a
        href="/api/v1/auth/steam/login"
        className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/80 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <LogIn aria-hidden className="size-4" /> {t("live.hub.following.signIn")}
      </a>
    </section>
  );
}
