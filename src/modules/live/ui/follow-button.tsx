"use client";

import { Heart, HeartOff } from "lucide-react";
import { cn } from "cn";
import { useT } from "@/common/i18n/client";

/** Follow / unfollow a Twitch channel. The parent does the request. */
export function FollowButton({
  name,
  following,
  busy,
  onToggle,
  compact = false,
}: {
  name: string;
  following: boolean;
  busy: boolean;
  onToggle: () => void;
  /** Icon only (labelled for screen readers). */
  compact?: boolean;
}) {
  const t = useT();
  const label = following
    ? t("live.hub.follow.labelUnfollow", { name })
    : t("live.hub.follow.labelFollow", { name });
  const Icon = following ? HeartOff : Heart;
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={busy}
      aria-pressed={following}
      aria-label={label}
      title={label}
      className={cn(
        "group/follow relative inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 touch:tap-area",
        compact ? "size-8" : "h-8 px-3",
        following
          ? "bg-gold/15 text-gold ring-1 ring-gold/30 hover:bg-gold/10"
          : "text-muted-foreground ring-1 ring-white/10 hover:bg-white/[0.05] hover:text-foreground",
      )}
    >
      {following ? (
        <>
          <Heart aria-hidden className="size-3.5 fill-current group-hover/follow:hidden" />
          <Icon aria-hidden className="hidden size-3.5 group-hover/follow:block" />
        </>
      ) : (
        <Icon aria-hidden className="size-3.5" />
      )}
      {!compact && (following ? t("live.hub.follow.following") : t("live.hub.follow.follow"))}
    </button>
  );
}
