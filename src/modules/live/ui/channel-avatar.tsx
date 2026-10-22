"use client";

import { cn } from "cn";
import { useImageFailed } from "./use-image-failed";

const SIZES = { xs: "size-6", sm: "size-9", md: "size-12" } as const;

/** A channel's profile picture, or its initial when there is none (or it fails to load). */
export function ChannelAvatar({
  url,
  name,
  size = "sm",
  live = false,
  className,
}: {
  url: string | null | undefined;
  name: string;
  size?: keyof typeof SIZES;
  /** A red ring for channels that are live. */
  live?: boolean;
  className?: string;
}) {
  const { failed, onError, check } = useImageFailed();
  return (
    <span
      className={cn(
        "relative inline-block shrink-0 overflow-hidden rounded-full bg-muted",
        live ? "ring-2 ring-loss ring-offset-2 ring-offset-card" : "ring-1 ring-white/10",
        SIZES[size],
        className,
      )}
    >
      {url && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- Twitch CDN image, already sized
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          ref={check}
          onError={onError}
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <span
          aria-hidden
          className="grid size-full place-items-center font-display text-sm font-bold text-gold"
        >
          {name.slice(0, 1).toUpperCase()}
        </span>
      )}
    </span>
  );
}
