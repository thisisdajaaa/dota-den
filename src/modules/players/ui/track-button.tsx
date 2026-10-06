"use client";

import { ApiClientError, apiRequest } from "@/common/http/api-client";
import { Check, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { useT } from "@/common/i18n/client";

/** Track / untrack a player for the signed-in user. */
export function TrackButton({
  accountId32,
  name,
  tracked: initial,
  compact = false,
}: {
  accountId32: number;
  name: string;
  tracked: boolean;
  /** Icon-sized control for list rows. */
  compact?: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [tracked, setTracked] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    const status = await apiRequest(
      tracked ? `/api/v1/me/follows/${accountId32}` : "/api/v1/me/follows",
      tracked ? { method: "DELETE" } : { method: "POST", body: { accountId32 } },
    ).then(
      () => 200,
      (e: unknown) => (e instanceof ApiClientError ? e.status : 0),
    );
    setBusy(false);
    if (status === 200) {
      setTracked(!tracked);
      toast.success(
        tracked ? t("players.track.stopped", { name }) : t("players.track.started", { name }),
      );
      router.refresh();
      return;
    }
    const message =
      status === 409
        ? t("players.track.errorMax")
        : status === 429
          ? t("players.track.errorRate")
          : status === 401
            ? t("players.track.errorSession")
            : t("players.track.errorGeneric");
    toast.error(message);
  }

  const label = tracked
    ? t("players.track.labelStop", { name })
    : t("players.track.labelTrack", { name });
  const Icon = tracked ? Check : Plus;

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={tracked}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50",
        compact ? "size-8" : "h-9 px-3.5",
        tracked
          ? "bg-gold/15 text-gold ring-1 ring-gold/30 hover:bg-gold/10"
          : compact
            ? "text-muted-foreground hover:bg-white/[0.05] hover:text-foreground"
            : "bg-primary text-primary-foreground hover:bg-primary/80",
      )}
    >
      <Icon aria-hidden className="size-4" />
      {!compact && (tracked ? t("players.track.tracking") : t("players.track.track"))}
    </button>
  );
}
