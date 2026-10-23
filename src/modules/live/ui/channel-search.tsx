"use client";

import { useEffect, useId, useState } from "react";
import { ExternalLink, Play, SearchX, UserSearch } from "lucide-react";
import { cn } from "cn";
import { ApiClientError, apiRequest } from "@/common/http/api-client";
import { useT } from "@/common/i18n/client";
import { SearchInput } from "@/components/search-input";
import { Skeleton } from "@/components/ui/skeleton";
import { channelKey, channelUrl, PLATFORM_NAMES, type Platform } from "../domain/platform";
import type { ChannelHit } from "../domain/streams";
import type { ChannelSearchDto } from "../dtos/responses/streamers.dto";
import { ChannelAvatar } from "./channel-avatar";
import { PlatformBadge } from "./platform-badge";

const DEBOUNCE_MS = 350;
const MIN_QUERY = 2;

type SearchState =
  | { key: string; status: "done"; hits: ChannelHit[] }
  | { key: string; status: "error"; rateLimited: boolean };

/**
 * Find a channel by name on every configured site; live ones play in the page, offline ones
 * link out.
 */
export function ChannelSearch({
  platforms,
  watching,
  onWatch,
  followControl,
}: {
  /** The sites searched (Kick's search works differently, and the copy says so). */
  platforms: readonly Platform[];
  /** `channelKey` of the channel playing, if any. */
  watching: string | null;
  onWatch: (hit: ChannelHit) => void;
  followControl?: (hit: ChannelHit) => React.ReactNode;
}) {
  const t = useT();
  const inputId = useId();
  const [q, setQ] = useState("");
  const [liveOnly, setLiveOnly] = useState(false);
  const [result, setResult] = useState<SearchState | null>(null);
  const [submitted, setSubmitted] = useState(0);

  const query = q.trim();
  const key = `${liveOnly ? 1 : 0}:${query.toLowerCase()}`;
  const ready = query.length >= MIN_QUERY;

  useEffect(() => {
    if (query.length < MIN_QUERY) return;
    const ctrl = new AbortController();
    const timer = setTimeout(
      async () => {
        const params = new URLSearchParams({ q: query });
        if (liveOnly) params.set("live", "1");
        try {
          const data = await apiRequest<ChannelSearchDto>(`/api/v1/live/channels?${params}`, {
            signal: ctrl.signal,
          });
          setResult({ key, status: "done", hits: data.channels });
        } catch (e) {
          if (ctrl.signal.aborted) return;
          setResult({
            key,
            status: "error",
            rateLimited: e instanceof ApiClientError && e.status === 429,
          });
        }
      },
      submitted > 0 ? 0 : DEBOUNCE_MS,
    );
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
    // `submitted` re-runs a search right away on Enter.
  }, [query, liveOnly, key, submitted]);

  const current = ready && result?.key === key ? result : null;
  const loading = ready && !current;

  return (
    <section aria-labelledby="search-title" className="panel space-y-4 p-4 sm:p-5">
      <div>
        <h2 id="search-title" className="flex items-center gap-2 text-lg font-semibold">
          <UserSearch aria-hidden className="size-5 text-gold" /> {t("live.hub.search.title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("live.hub.search.subtitle")}</p>
        {platforms.includes("kick") && (
          <p className="mt-1 text-xs text-muted-foreground">{t("live.hub.search.kickNote")}</p>
        )}
      </div>
      <form
        role="search"
        className="flex flex-col gap-3 sm:flex-row sm:items-center"
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted((n) => n + 1);
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          {t("live.hub.search.label")}
        </label>
        <SearchInput
          id={inputId}
          value={q}
          onValueChange={(v) => {
            setQ(v);
            setSubmitted(0);
          }}
          placeholder={t("live.hub.search.placeholder")}
          autoComplete="off"
          spellCheck={false}
          maxLength={50}
          className="flex-1"
          inputClassName="h-10"
        />
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm select-none touch:min-h-10">
          <input
            type="checkbox"
            checked={liveOnly}
            onChange={(e) => setLiveOnly(e.target.checked)}
            className="size-4 accent-[var(--gold)]"
          />
          {t("live.hub.search.liveOnly")}
        </label>
      </form>

      <div aria-live="polite" aria-busy={loading}>
        {!ready ? (
          <p className="text-xs text-muted-foreground">{t("live.hub.search.hint")}</p>
        ) : loading ? (
          <div className="space-y-2" aria-label={t("live.hub.search.searching")}>
            <span className="sr-only">{t("live.hub.search.searching")}</span>
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg p-2">
                <Skeleton className="size-9 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-32 max-w-full" />
                  <Skeleton className="h-3 w-56 max-w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : current?.status === "error" ? (
          <p role="alert" className="text-sm text-muted-foreground">
            {current.rateLimited ? t("live.hub.search.rateLimited") : t("live.hub.search.error")}
          </p>
        ) : current && current.hits.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <SearchX aria-hidden className="size-4" /> {t("live.hub.search.empty", { q: query })}
          </p>
        ) : current ? (
          <ul
            aria-label={t("live.hub.search.results", { q: query })}
            className="max-h-[26rem] [scrollbar-width:thin] divide-y divide-white/[0.05] overflow-y-auto overscroll-contain rounded-lg border border-white/[0.06]"
            tabIndex={0}
          >
            {current.hits.map((hit) => (
              <ChannelRow
                key={`${hit.platform}:${hit.id}`}
                hit={hit}
                playing={watching === channelKey(hit.platform, hit.login)}
                onWatch={() => onWatch(hit)}
                follow={followControl?.(hit)}
              />
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

function ChannelRow({
  hit,
  playing,
  onWatch,
  follow,
}: {
  hit: ChannelHit;
  playing: boolean;
  onWatch: () => void;
  follow?: React.ReactNode;
}) {
  const t = useT();
  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-3 px-3 py-2.5 sm:flex-nowrap",
        playing && "bg-gold/[0.06]",
      )}
    >
      <ChannelAvatar url={hit.avatarUrl} name={hit.displayName} live={hit.live} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 text-sm font-medium">
          <span className="truncate">{hit.displayName}</span>
          <PlatformBadge platform={hit.platform} />
          {hit.live ? (
            <span className="rounded bg-loss px-1.5 py-px text-[0.6rem] font-bold tracking-wider text-white uppercase">
              {t("live.hub.search.live")}
            </span>
          ) : (
            <span className="rounded bg-white/[0.06] px-1.5 py-px text-[0.6rem] font-semibold tracking-wider text-muted-foreground uppercase">
              {t("live.hub.search.offline")}
            </span>
          )}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {hit.live && hit.title
            ? hit.gameName
              ? `${hit.gameName} · ${hit.title}`
              : hit.title
            : channelUrl(hit.platform, hit.login).replace(/^https:\/\/(www\.)?/, "")}
        </p>
      </div>
      <div className="ml-auto flex items-center gap-2">
        {follow}
        {hit.live ? (
          <button
            type="button"
            onClick={onWatch}
            disabled={playing}
            aria-label={t("live.hub.search.watchLabel", { name: hit.displayName })}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/80 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
          >
            <Play aria-hidden className="size-3.5" />
            {playing ? t("live.watch.playing") : t("live.hub.search.watch")}
          </button>
        ) : (
          <a
            href={channelUrl(hit.platform, hit.login)}
            target="_blank"
            rel="noreferrer"
            aria-label={t("live.hub.search.openLabel", {
              name: hit.displayName,
              platform: PLATFORM_NAMES[hit.platform],
            })}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium ring-1 ring-white/10 transition-colors outline-none hover:bg-white/[0.05] hover:text-gold focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {t("live.hub.search.open", { platform: PLATFORM_NAMES[hit.platform] })}{" "}
            <ExternalLink aria-hidden className="size-3.5" />
          </a>
        )}
      </div>
    </li>
  );
}
