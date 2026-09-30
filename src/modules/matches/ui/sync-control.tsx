"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface SyncSummary {
  inserted: number;
  fetched: number;
  backfillComplete: boolean;
}

type Status = "idle" | "syncing" | "waiting" | "busy" | "error";

/** Automatic retries when OpenDota is busy or down, before showing "paused". */
const MAX_AUTO_RETRIES = 4;
const UNAVAILABLE_RETRY_MS = 90_000;

/**
 * Keeps the signed-in player's matches fresh without a button press:
 * syncs on mount when stale, then keeps importing older history until complete.
 */
export function SyncControl({
  stale,
  backfillComplete,
  backfillCooldownMs,
  recheckMs,
  awaitingHistory,
  lastSyncedLabel,
}: {
  stale: boolean;
  backfillComplete: boolean;
  backfillCooldownMs: number;
  /** Re-check interval while waiting for the upstream to fetch a new player's history. */
  recheckMs: number;
  /** No matches imported yet: keep checking until the upstream has them. */
  awaitingHistory: boolean;
  lastSyncedLabel: string | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [importing, setImporting] = useState(!backfillComplete);
  // Keep scheduling syncs while importing older history or waiting for a first history.
  const importingRef = useRef(!backfillComplete || awaitingHistory);
  const [awaiting, setAwaiting] = useState(awaitingHistory);
  const awaitingRef = useRef(awaitingHistory);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retries = useRef(0);
  const started = useRef(false);
  // Timers call through this ref so a scheduled retry always runs the latest `sync`.
  const syncRef = useRef<(manual: boolean) => Promise<void>>(async () => {});

  const schedule = (ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void syncRef.current(false), ms);
  };

  async function sync(manual: boolean) {
    if (timer.current) clearTimeout(timer.current);
    // Pressing "Sync now" starts the automatic retries over.
    if (manual) retries.current = 0;
    setStatus("syncing");
    try {
      const res = await fetch("/api/v1/me/matches/sync", { method: "POST" });
      const body: unknown = await res.json().catch(() => null);
      if (res.ok) {
        retries.current = 0;
        const s = body as SyncSummary;
        const stillEmpty = awaitingRef.current && s.fetched === 0;
        awaitingRef.current = stillEmpty;
        setAwaiting(stillEmpty);
        setImporting(!s.backfillComplete);
        importingRef.current = !s.backfillComplete || stillEmpty;
        if (s.inserted > 0) {
          toast.success(`${s.inserted} match${s.inserted === 1 ? "" : "es"} imported`);
        } else if (manual) {
          toast("You're up to date");
        }
        router.refresh();
        if (!s.backfillComplete) {
          setStatus("waiting");
          schedule(backfillCooldownMs + 1_000);
        } else if (stillEmpty) {
          setStatus("waiting");
          schedule(recheckMs + 1_000);
        } else {
          setStatus("idle");
        }
        return;
      }
      const details = (
        body as { error?: { details?: { retryAt?: string; reason?: string } } } | null
      )?.error?.details;
      const retryAt = details?.retryAt;
      // OpenDota busy (rate limited) or down: wait and try again a few times before giving up.
      const upstreamBusy = res.status === 429 && details?.reason === "upstream_rate_limited";
      if ((upstreamBusy || res.status >= 500) && retries.current < MAX_AUTO_RETRIES) {
        retries.current++;
        setStatus("busy");
        if (manual) toast("OpenDota is busy. We'll keep trying.");
        schedule(
          upstreamBusy && retryAt
            ? Math.max(5_000, new Date(retryAt).getTime() - Date.now() + 1_000)
            : UNAVAILABLE_RETRY_MS,
        );
        return;
      }
      if (res.status === 429 && retryAt && !upstreamBusy) {
        // Cooldown: quietly try again once it passes if history is still importing.
        if (manual) toast("Synced recently. Try again in a few minutes.");
        setStatus(importingRef.current ? "waiting" : "idle");
        if (importingRef.current) {
          schedule(Math.max(1_000, new Date(retryAt).getTime() - Date.now() + 1_000));
        }
        return;
      }
      if (res.status === 409) {
        // Another sync (e.g. a background import chunk) is running: check again shortly.
        setStatus(importingRef.current ? "waiting" : "idle");
        if (importingRef.current) schedule(15_000);
        return;
      }
      const message =
        (body as { error?: { message?: string } } | null)?.error?.message ?? "Sync failed.";
      setStatus("error");
      if (manual) toast.error(message);
    } catch {
      setStatus("error");
      if (manual) toast.error("Network error. Check your connection.");
    }
  }

  useEffect(() => {
    syncRef.current = sync;
  });

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (stale) void syncRef.current(false);
    else if (!backfillComplete) schedule(backfillCooldownMs);
    else if (awaitingHistory) schedule(backfillCooldownMs); // cooldown reply reschedules precisely
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // Run once on mount; later syncs are scheduled by `sync` itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const label =
    status === "syncing"
      ? importing
        ? "Importing match history…"
        : "Syncing…"
      : status === "waiting"
        ? awaiting
          ? "Waiting for OpenDota to fetch your history…"
          : "Importing older matches…"
        : status === "busy"
          ? "OpenDota is busy. Retrying shortly…"
          : status === "error"
            ? "Sync paused. OpenDota may be unavailable."
            : lastSyncedLabel
              ? `Synced ${lastSyncedLabel}`
              : "Not synced yet";

  return (
    // A soft backdrop keeps the status readable over the banner's hero art.
    <div className="flex items-center gap-1 rounded-full bg-background/75 py-0.5 pr-0.5 pl-3 text-xs text-muted-foreground ring-1 ring-white/[0.06] backdrop-blur">
      <span className="flex items-center gap-2" role="status" aria-live="polite">
        <span
          aria-hidden
          className={cn(
            "size-1.5 rounded-full",
            status === "syncing" || status === "waiting" || status === "busy"
              ? "animate-pulse bg-gold"
              : status === "error"
                ? "bg-loss"
                : "bg-win",
          )}
        />
        {label}
      </span>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => void sync(true)}
            disabled={status === "syncing"}
            aria-label="Sync now"
          >
            <RefreshCw className={cn("size-3.5", status === "syncing" && "animate-spin")} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Sync now</TooltipContent>
      </Tooltip>
    </div>
  );
}
