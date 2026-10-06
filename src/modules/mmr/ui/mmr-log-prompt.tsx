"use client";

import { apiRequest, errorMessage, fieldErrors } from "@/common/http/api-client";
import { TrendingUp, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useT } from "@/common/i18n/client";
import { plural } from "@/common/i18n/translate";

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
  const t = useT();
  const router = useRouter();
  const dismissed = useSyncExternalStore(subscribe, readDismissed, () => "");
  const [mmr, setMmr] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (dismissed === newestGameId) return null;

  const message =
    lastMmr === null
      ? t("mmr.prompt.first")
      : exactIfLoggedNow
        ? t("mmr.prompt.exactNow", { mmr: lastMmr.toLocaleString("en-US") })
        : t("mmr.prompt.many", {
            games: plural(t, "mmr.prompt.games", gamesSince),
            mmr: lastMmr.toLocaleString("en-US"),
          });

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
      await apiRequest("/api/v1/mmr-entries", {
        method: "POST",
        body: { mmr: mmr.trim(), observedAt: new Date().toISOString(), note: null },
      });
      toast.success(t("mmr.prompt.logged"));
      setMmr("");
      router.refresh();
    } catch (err) {
      setError(fieldErrors(err).mmr?.[0] ?? errorMessage(err, t("mmr.prompt.saveFailed")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label={t("mmr.prompt.region")} className="panel flex items-start gap-3 p-4">
      <TrendingUp aria-hidden className="mt-2 size-5 shrink-0 text-gold" />
      {/* Message and form wrap on narrow screens; the close button keeps its own column. */}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-3">
        <p className="min-w-[12rem] flex-1 text-sm">{message}</p>
        <form onSubmit={save} className="flex items-start gap-2">
          <div>
            <input
              inputMode="numeric"
              aria-label={t("mmr.prompt.input")}
              placeholder={t("mmr.prompt.placeholder")}
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
            {busy ? t("mmr.prompt.saving") : t("mmr.prompt.logIt")}
          </Button>
        </form>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("mmr.prompt.notNow")}
        className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
      >
        <X aria-hidden className="size-4" />
      </button>
    </section>
  );
}
