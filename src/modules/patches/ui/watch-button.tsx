"use client";

import { ApiClientError, apiRequest } from "@/common/http/api-client";
import { useT } from "@/common/i18n/client";
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
  const t = useT();
  const router = useRouter();
  const [watched, setWatched] = useState(watchedHeroIds.includes(heroId));
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    const next = watched
      ? watchedHeroIds.filter((id) => id !== heroId)
      : [...watchedHeroIds, heroId];
    const status = await apiRequest("/api/v1/me/patch-watchlist", {
      method: "PUT",
      body: { heroIds: next, itemIds },
    }).then(
      () => 200,
      (e: unknown) => (e instanceof ApiClientError ? e.status : 0),
    );
    setBusy(false);
    if (status === 200) {
      setWatched(!watched);
      toast.success(
        t(watched ? "patches.watch.stopped" : "patches.watch.watching", { hero: heroName }),
      );
      router.refresh();
    } else {
      toast.error(status === 400 ? t("patches.watch.full") : t("patches.watch.failed"));
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={watched}
      aria-label={t(watched ? "patches.watch.stopLabel" : "patches.watch.watchLabel", {
        hero: heroName,
      })}
      title={watched ? t("patches.watch.onList") : t("patches.watch.add")}
      className={cn(
        "rounded-md p-1.5 transition-colors disabled:opacity-50",
        watched ? "text-gold" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Star className={cn("size-4", watched && "fill-current")} />
    </button>
  );
}
