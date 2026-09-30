"use client";

import { TrendingUp, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const DISMISS_KEY = "dd_mmr_prompt_dismissed";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}
function readDismissed(): string {
  try {
    return localStorage.getItem(DISMISS_KEY) ?? "";
  } catch {
    return "";
  }
}

/**
 * Asks for your MMR after ranked games, so changes can be exact (ADR 0007). Dismissing hides
 * it until your next ranked game.
 */
export function MmrLogPrompt({
  gamesSince,
  newestGameId,
  lastMmr,
  exactIfLoggedNow,
}: {
  gamesSince: number;
  newestGameId: string;
  lastMmr: number | null;
  exactIfLoggedNow: boolean;
}) {
  const router = useRouter();
  const dismissed = useSyncExternalStore(subscribe, readDismissed, () => "");
  const [mmr, setMmr] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (dismissed === newestGameId) return null;

  const games = `${gamesSince} ranked game${gamesSince === 1 ? "" : "s"}`;
  const message =
    lastMmr === null
      ? `Log your MMR after you play and Dota Den can show exactly how much each game moved it.`
      : exactIfLoggedNow
        ? `You played 1 ranked game since you logged ${lastMmr.toLocaleString("en-US")}. Log your MMR now and that game's change will be exact.`
        : `You played ${games} since you logged ${lastMmr.toLocaleString("en-US")}. Logging now gives the total change for those games; log after each game to see every game's exact change.`;

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, newestGameId);
      window.dispatchEvent(new StorageEvent("storage", { key: DISMISS_KEY }));
    } catch {
      // Private mode: it just shows again next time.
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/mmr-entries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mmr: mmr.trim(), observedAt: new Date().toISOString(), note: null }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          // The route sends the field errors themselves as details.
          error?: { message?: string; details?: { mmr?: string[] } };
        } | null;
        throw new Error(
          body?.error?.details?.mmr?.[0] ?? body?.error?.message ?? "Couldn't save that.",
        );
      }
      toast.success("MMR logged.");
      setMmr("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Log your MMR" className="panel flex items-start gap-3 p-4">
      <TrendingUp aria-hidden className="mt-2 size-5 shrink-0 text-gold" />
      {/* Message and form wrap on narrow screens; the close button keeps its own column. */}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-3">
        <p className="min-w-[12rem] flex-1 text-sm">{message}</p>
        <form onSubmit={save} className="flex items-start gap-2">
          <div>
            <input
              inputMode="numeric"
              aria-label="Your MMR now"
              placeholder="MMR now"
              value={mmr}
              onChange={(e) => setMmr(e.target.value)}
              className="h-9 w-28 rounded-lg border border-white/10 bg-background px-3 text-sm tabular-nums"
            />
            {error && (
              <p role="alert" className="mt-1 max-w-48 text-xs text-loss">
                {error}
              </p>
            )}
          </div>
          <Button type="submit" size="sm" disabled={busy || !mmr.trim()} className="h-9">
            {busy ? "Saving…" : "Log it"}
          </Button>
        </form>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Not now"
        className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
      >
        <X aria-hidden className="size-4" />
      </button>
    </section>
  );
}
