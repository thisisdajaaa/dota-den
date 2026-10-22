"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Radio, TvMinimal } from "lucide-react";
import { useLocale, useT } from "@/common/i18n/client";
import { channelKey, PLATFORM_NAMES, PLATFORMS, type Platform } from "../domain/platform";
import { inLanguage, languageCode, languageOptions, onPlatform } from "../domain/streams";
import type { LiveStream, StreamGameHint } from "../domain/watch";
import { PlatformBadge } from "./platform-badge";
import { StreamCard } from "./stream-card";

/** Two rows on a wide screen per site; a phone shows one column, so keep it short. */
const PAGE = 8;

/** A language code's name in the viewer's language ("en" → "English"). */
export function useLanguageName(): (code: string) => string {
  const locale = useLocale();
  const t = useT();
  return useMemo(() => {
    let names: Intl.DisplayNames | null = null;
    try {
      names = new Intl.DisplayNames([locale, "en"], { type: "language" });
    } catch {
      names = null;
    }
    return (code: string) => {
      if (!code || code === "other") return t("live.hub.streams.otherLanguage");
      try {
        return names?.of(code) ?? code.toUpperCase();
      } catch {
        return code.toUpperCase();
      }
    };
  }, [locale, t]);
}

/** Live Dota 2 streams from every site: a language filter, most watched first, a page at a time. */
export function StreamsGrid({
  streams,
  hints,
  watching,
  onWatch,
  followControl,
}: {
  /** Already sorted by viewers. */
  streams: LiveStream[];
  /** Keyed by `channelKey(platform, channel)`. */
  hints: Record<string, StreamGameHint>;
  /** `channelKey` of the stream playing, if any. */
  watching: string | null;
  onWatch: (stream: LiveStream) => void;
  followControl?: (stream: LiveStream) => React.ReactNode;
}) {
  const t = useT();
  const languageName = useLanguageName();
  const [language, setLanguage] = useState<string | null>(null);
  const options = useMemo(() => languageOptions(streams), [streams]);
  // A language that left the list (its last stream ended) falls back to all.
  const active = language && options.some((o) => o.code === language) ? language : null;
  const visible = useMemo(() => inLanguage(streams, active), [streams, active]);

  return (
    <section aria-labelledby="streams-title" className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="streams-title" className="flex items-center gap-2 text-lg font-semibold">
            <Radio aria-hidden className="size-5 text-loss" /> {t("live.hub.streams.title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("live.hub.streams.subtitle")}</p>
        </div>
        {options.length > 1 && (
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">{t("live.hub.streams.language")}</span>
            <span className="relative">
              <select
                value={active ?? ""}
                onChange={(e) => setLanguage(e.target.value || null)}
                className="h-9 max-w-[14rem] appearance-none rounded-lg border border-white/[0.08] bg-background/60 pr-8 pl-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
              >
                <option value="">
                  {t("live.hub.streams.allLanguages", { n: streams.length })}
                </option>
                {options.map((o) => (
                  <option key={o.code} value={o.code}>
                    {t("live.hub.streams.languageOption", {
                      name: languageName(o.code),
                      n: o.streams,
                    })}
                  </option>
                ))}
              </select>
              <ChevronDown
                aria-hidden
                className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              />
            </span>
          </label>
        )}
      </div>

      {streams.length === 0 ? (
        <div className="panel grid place-items-center gap-2 px-6 py-12 text-center">
          <TvMinimal aria-hidden className="size-8 text-gold/70" />
          <p className="text-sm text-muted-foreground">{t("live.hub.streams.none")}</p>
        </div>
      ) : (
        // One section per site: Twitch's biggest streams would otherwise bury Kick's.
        PLATFORMS.filter((p) => streams.some((s) => s.platform === p)).map((p) => (
          <SiteStreams
            // A new language starts each site's list over.
            key={`${p}:${active ?? ""}`}
            platform={p}
            streams={onPlatform(visible, p)}
            hints={hints}
            watching={watching}
            onWatch={onWatch}
            followControl={followControl}
            languageName={languageName}
          />
        ))
      )}
    </section>
  );
}

/** One site's live streams, most watched first, a page at a time. */
function SiteStreams({
  platform,
  streams,
  hints,
  watching,
  onWatch,
  followControl,
  languageName,
}: {
  platform: Platform;
  streams: LiveStream[];
  hints: Record<string, StreamGameHint>;
  watching: string | null;
  onWatch: (stream: LiveStream) => void;
  followControl?: (stream: LiveStream) => React.ReactNode;
  languageName: (code: string) => string;
}) {
  const t = useT();
  const [shown, setShown] = useState(PAGE);
  const page = streams.slice(0, shown);
  const remaining = streams.length - page.length;
  const name = PLATFORM_NAMES[platform];
  const titleId = `streams-${platform}`;

  return (
    <section aria-labelledby={titleId} className="space-y-3">
      <h3 id={titleId} className="flex items-center gap-2 text-base font-semibold">
        <PlatformBadge platform={platform} className="text-[0.7rem]" />
        {t("live.hub.streams.siteTitle", { platform: name })}
        <span className="text-sm font-normal text-muted-foreground tabular-nums">
          {streams.length.toLocaleString("en-US")}
        </span>
      </h3>
      {streams.length === 0 ? (
        <p className="panel px-5 py-6 text-sm text-muted-foreground">
          {t("live.hub.streams.siteEmpty", { platform: name })}
        </p>
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {page.map((s) => (
              <StreamCard
                key={channelKey(s.platform, s.channel)}
                stream={s}
                hint={hints[channelKey(s.platform, s.channel)]}
                playing={watching === channelKey(s.platform, s.channel)}
                languageName={languageName(languageCode(s.language))}
                onWatch={() => onWatch(s)}
                follow={followControl?.(s)}
              />
            ))}
          </ul>
          <div className="flex flex-col items-center gap-2">
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {t("live.hub.streams.showing", { shown: page.length, total: streams.length })}
            </p>
            {remaining > 0 && (
              <button
                type="button"
                onClick={() => setShown((n) => n + PAGE)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg px-4 text-sm font-medium ring-1 ring-white/10 transition-colors outline-none hover:bg-white/[0.05] hover:text-gold focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <ChevronDown aria-hidden className="size-4" />
                {t("live.hub.streams.showMore", { n: Math.min(PAGE, remaining) })}
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
