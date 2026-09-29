"use client";

import { Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "cn";

/** Toggle a hero on the signed-in user's patch watchlist. */
export function WatchButton({
  heroId,
  heroName,
  watchedHeroIds,
  itemIds,
}: {
  heroId: number;
  heroName: string;
  watchedHeroIds: number[];
  itemIds: number[];
}) {
  const router = useRouter();
  const [watched, setWatched] = useState(watchedHeroIds.includes(heroId));
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    const next = watched
      ? watchedHeroIds.filter((id) => id !== heroId)
      : [...watchedHeroIds, heroId];
    const res = await fetch("/api/v1/me/patch-watchlist", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ heroIds: next, itemIds }),
    });
    setBusy(false);
    if (res.ok) {
      setWatched(!watched);
      toast.success(watched ? `Stopped watching ${heroName}` : `Watching ${heroName}`);
      router.refresh();
    } else {
      toast.error(
        res.status === 400
          ? "Your watchlist is full (50 heroes)."
          : "Couldn't update your watchlist.",
      );
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={watched}
      aria-label={watched ? `Stop watching ${heroName}` : `Watch ${heroName}`}
      title={watched ? "On your watchlist" : "Add to your watchlist"}
      className={cn(
        "rounded-md p-1.5 transition-colors disabled:opacity-50",
        watched ? "text-gold" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Star className={cn("size-4", watched && "fill-current")} />
    </button>
  );
}
