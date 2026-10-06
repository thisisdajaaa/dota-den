"use client";

import { ApiClientError, apiRequest } from "@/common/http/api-client";
import { Check, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "cn";

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
      toast.success(tracked ? `Stopped tracking ${name}` : `Tracking ${name}`);
      router.refresh();
      return;
    }
    const message =
      status === 409
        ? "You're tracking the maximum number of players. Untrack someone first."
        : status === 429
          ? "Too many changes. Try again in a minute."
          : status === 401
            ? "Your session ended. Sign in again to track players."
            : "Couldn't update your tracked players. Try again.";
    toast.error(message);
  }

  const label = tracked ? `Stop tracking ${name}` : `Track ${name}`;
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
      {!compact && (tracked ? "Tracking" : "Track")}
    </button>
  );
}
