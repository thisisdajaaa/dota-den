"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, TvMinimal } from "lucide-react";
import { toast } from "sonner";
import { ApiClientError, apiRequest } from "@/common/http/api-client";
import { useT } from "@/common/i18n/client";
import { channelKey, parseWatchParam, watchParam, type Platform } from "../domain/platform";
import { sortFollowing, type ChannelHit, type FollowedChannel } from "../domain/streams";
import type { LiveStream } from "../domain/watch";
import type { WatchHubData } from "../dtos/responses/streamers.dto";
import { ChannelSearch } from "./channel-search";
import { FollowButton } from "./follow-button";
import { FollowingRow, FollowSignInPrompt } from "./following-row";
import { StreamPlayer, type NowPlaying } from "./stream-player";
import { StreamsGrid, useLanguageName } from "./streams-grid";

/** A channel that can be followed: its site, id and names. */
interface FollowTarget {
  platform: Platform;
  channelId: string;
  login: string;
  displayName: string;
  avatarUrl: string | null;
  stream: LiveStream | null;
  /** From a search: whether it's live (no stream details). */
  live?: boolean;
}

type Current = NowPlaying & { channelId?: string };

/** A follow's identity: the same channel id can exist on two sites. */
const followKey = (f: { platform: Platform; channelId: string }) => `${f.platform}:${f.channelId}`;

const fromStream = (s: LiveStream): Current => ({
  platform: s.platform,
  login: s.channel.toLowerCase(),
  displayName: s.displayName,
  title: s.title,
  viewers: s.viewers,
  language: s.language,
  avatarUrl: s.avatarUrl,
  gameName: s.gameName,
  channelId: s.userId,
});

/**
 * The watch hub on /live: the player (deep-linked as `?watch=<channel>`, or
 * `?watch=<site>:<channel>` for sites other than Twitch), the channels you follow, channel
 * search and live Dota 2 streams from every configured site. The page refreshes its data
 * every minute; the player keeps playing because its state lives here and in the URL, and
 * its iframes only change when the channel does.
 */
export function WatchHub({
  data,
  platforms,
  signedIn,
  following,
  followingFailed,
}: {
  data: WatchHubData;
  /** Streaming sites that are set up; none means no stream listings or search. */
  platforms: Platform[];
  signedIn: boolean;
  /** The viewer's followed channels (live first); null for guests. */
  following: FollowedChannel[] | null;
  followingFailed: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const target = parseWatchParam(searchParams.get("watch"));
  const watching = target ? channelKey(target.platform, target.channel) : null;
  const languageName = useLanguageName();

  // Follows change here first (optimistic), then come back from the server on refresh.
  const [follows, setFollows] = useState<FollowedChannel[]>(following ?? []);
  const [syncedFrom, setSyncedFrom] = useState(following);
  if (following !== syncedFrom) {
    setSyncedFrom(following);
    setFollows(following ?? []);
  }
  const [busy, setBusy] = useState<ReadonlySet<string>>(() => new Set());
  const [picked, setPicked] = useState<Current | null>(null);

  const playerRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const revealPlayer = useRef(false);

  // After choosing a channel: bring the player into view and move focus to it.
  useEffect(() => {
    if (!watching || !revealPlayer.current) return;
    revealPlayer.current = false;
    scrollToPlayer(playerRef.current, headingRef.current);
  }, [watching]);

  const byKey = useMemo(
    () => new Map((data.streams ?? []).map((s) => [channelKey(s.platform, s.channel), s])),
    [data.streams],
  );

  const current: Current | null = useMemo(() => {
    if (!target || !watching) return null;
    const followed = follows.find((f) => channelKey(f.platform, f.login) === watching);
    const stream = byKey.get(watching) ?? followed?.stream;
    if (stream) return { ...fromStream(stream), channelId: stream.userId ?? followed?.channelId };
    if (picked && channelKey(picked.platform, picked.login) === watching) return picked;
    const base = { platform: target.platform, login: target.channel };
    if (followed)
      return {
        ...base,
        displayName: followed.displayName,
        avatarUrl: followed.avatarUrl,
        channelId: followed.channelId,
      };
    return { ...base, displayName: target.channel };
  }, [target, watching, follows, byKey, picked]);

  function watch(next: Current) {
    setPicked(next);
    if (channelKey(next.platform, next.login) === watching) {
      scrollToPlayer(playerRef.current, headingRef.current);
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set("watch", watchParam({ platform: next.platform, channel: next.login }));
    revealPlayer.current = true;
    window.history.pushState(null, "", `?${params}`);
  }

  function close() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("watch");
    const qs = params.toString();
    window.history.pushState(null, "", qs ? `?${qs}` : window.location.pathname);
  }

  const followed = new Set(follows.map(followKey));

  async function setFollow(target: FollowTarget, follow: boolean) {
    const key = followKey(target);
    setBusy((b) => new Set(b).add(key));
    try {
      if (follow)
        await apiRequest("/api/v1/me/streamers", {
          method: "POST",
          body: {
            platform: target.platform,
            channelId: target.channelId,
            login: target.login,
            displayName: target.displayName,
          },
        });
      else
        await apiRequest(`/api/v1/me/streamers/${target.platform}/${target.channelId}`, {
          method: "DELETE",
        });
      setFollows((list) => {
        const rest = list.filter((f) => followKey(f) !== key);
        if (!follow) return rest;
        const row: FollowedChannel = {
          platform: target.platform,
          channelId: target.channelId,
          login: target.login.toLowerCase(),
          displayName: target.displayName,
          avatarUrl: target.avatarUrl,
          status: target.stream ? "live" : target.live === false ? "offline" : "unknown",
          stream: target.stream,
        };
        return sortFollowing([...rest, row]);
      });
      toast.success(
        follow
          ? t("live.hub.follow.followed", { name: target.displayName })
          : t("live.hub.follow.unfollowed", { name: target.displayName }),
      );
      // Fresh live states for the row; the player isn't reloaded by a refresh.
      router.refresh();
    } catch (e) {
      const status = e instanceof ApiClientError ? e.status : 0;
      toast.error(
        status === 409
          ? t("live.hub.follow.errorMax")
          : status === 429
            ? t("live.hub.follow.errorRate")
            : status === 401
              ? t("live.hub.follow.errorSession")
              : status === 404
                ? t("live.hub.follow.errorMissing")
                : t("live.hub.follow.errorGeneric"),
      );
    } finally {
      setBusy((b) => {
        const next = new Set(b);
        next.delete(key);
        return next;
      });
    }
  }

  const followControl = (target: FollowTarget | null, compact: boolean) => {
    if (!signedIn || !target) return null;
    const isFollowing = followed.has(followKey(target));
    return (
      <FollowButton
        name={target.displayName}
        following={isFollowing}
        busy={busy.has(followKey(target))}
        compact={compact}
        onToggle={() => void setFollow(target, !isFollowing)}
      />
    );
  };

  const streamTarget = (s: LiveStream): FollowTarget | null =>
    s.userId
      ? {
          platform: s.platform,
          channelId: s.userId,
          login: s.channel,
          displayName: s.displayName,
          avatarUrl: s.avatarUrl ?? null,
          stream: s,
        }
      : null;
  const hitTarget = (h: ChannelHit): FollowTarget => ({
    platform: h.platform,
    channelId: h.id,
    login: h.login,
    displayName: h.displayName,
    avatarUrl: h.avatarUrl,
    stream: byKey.get(channelKey(h.platform, h.login)) ?? null,
    live: h.live,
  });

  return (
    <div className="space-y-8">
      <div ref={playerRef} className="scroll-mt-20">
        {current && watching && (
          <StreamPlayer
            key={watching}
            now={current}
            hint={data.hints[watching]}
            headingRef={headingRef}
            languageName={languageName}
            onClose={close}
            follow={
              current.channelId
                ? followControl(
                    {
                      platform: current.platform,
                      channelId: current.channelId,
                      login: current.login,
                      displayName: current.displayName,
                      avatarUrl: current.avatarUrl ?? null,
                      stream: byKey.get(watching) ?? null,
                    },
                    false,
                  )
                : null
            }
          />
        )}
      </div>

      {signedIn ? (
        <FollowingRow
          channels={follows}
          failed={followingFailed}
          watching={watching}
          busy={busy}
          onWatch={(c) =>
            watch({
              ...(c.stream
                ? fromStream(c.stream)
                : { platform: c.platform, login: c.login.toLowerCase() }),
              displayName: c.displayName,
              avatarUrl: c.avatarUrl,
              channelId: c.channelId,
            })
          }
          onUnfollow={(c) =>
            void setFollow(
              {
                platform: c.platform,
                channelId: c.channelId,
                login: c.login,
                displayName: c.displayName,
                avatarUrl: c.avatarUrl,
                stream: c.stream,
              },
              false,
            )
          }
        />
      ) : (
        <FollowSignInPrompt />
      )}

      {platforms.length > 0 && (
        <ChannelSearch
          watching={watching}
          onWatch={(h) => {
            const stream = byKey.get(channelKey(h.platform, h.login));
            watch({
              ...(stream
                ? fromStream(stream)
                : {
                    platform: h.platform,
                    login: h.login.toLowerCase(),
                    title: h.title,
                    language: h.language,
                    gameName: h.gameName,
                  }),
              displayName: h.displayName,
              avatarUrl: h.avatarUrl,
              channelId: h.id,
            });
          }}
          followControl={(h) => followControl(hitTarget(h), true)}
        />
      )}

      {platforms.length === 0 ? (
        <HubNotice icon="tv" text={t("live.hub.streams.notConfigured")} />
      ) : !data.streams ? (
        <HubNotice icon="alert" text={t("live.hub.streams.unavailable")} />
      ) : (
        <StreamsGrid
          streams={data.streams}
          hints={data.hints}
          watching={watching}
          onWatch={(s) => watch(fromStream(s))}
          followControl={(s) => followControl(streamTarget(s), true)}
        />
      )}
    </div>
  );
}

function scrollToPlayer(player: HTMLElement | null, heading: HTMLElement | null) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  player?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  heading?.focus({ preventScroll: true });
}

function HubNotice({ icon, text }: { icon: "tv" | "alert"; text: string }) {
  const Icon = icon === "tv" ? TvMinimal : AlertTriangle;
  return (
    <section
      role={icon === "alert" ? "alert" : undefined}
      className="panel grid place-items-center gap-3 px-6 py-12 text-center"
    >
      <Icon aria-hidden className="size-8 text-gold" />
      <p className="max-w-md text-sm text-muted-foreground">{text}</p>
    </section>
  );
}
