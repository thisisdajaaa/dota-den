"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface SyncSummary {
  fetched: number;
  inserted: number;
  rejected: number;
  backfillComplete: boolean;
}

export function SyncMatchesButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function sync() {
    setBusy(true);
    try {
      const res = await fetch("/api/v1/me/matches/sync", { method: "POST" });
      const body: unknown = await res.json().catch(() => null);
      if (res.ok) {
        const s = body as SyncSummary;
        toast.success(
          `Imported ${s.inserted} new match${s.inserted === 1 ? "" : "es"}` +
            (s.backfillComplete ? "." : ". More history remains; sync again later to continue."),
        );
        startTransition(() => router.refresh());
      } else {
        const message =
          (body as { error?: { message?: string } } | null)?.error?.message ?? "Sync failed.";
        toast.error(message);
      }
    } catch {
      toast.error("Network error. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button onClick={sync} disabled={busy} aria-busy={busy}>
      {busy ? "Syncing…" : "Sync matches"}
    </Button>
  );
}
