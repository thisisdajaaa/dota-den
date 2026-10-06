"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ScanSearch } from "lucide-react";
import { useT } from "@/common/i18n/client";
import { Button } from "@/components/ui/button";

/** Matches the 90s cache on unparsed matches: checking more often only re-reads the cache. */
const POLL_MS = 60_000;
const GIVE_UP_MS = 10 * 60_000;

/** Ask OpenDota to parse this match, then refresh the page until the stats arrive. */
export function ParseRequest({ matchId }: { matchId: string }) {
  const t = useT();
  const router = useRouter();
  const [state, setState] = useState<"idle" | "sending" | "waiting" | "slow" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const started = useRef<number | null>(null);

  useEffect(() => {
    if (state !== "waiting") return;
    const id = setInterval(() => {
      if (started.current && Date.now() - started.current > GIVE_UP_MS) {
        setState("slow");
        return;
      }
      router.refresh();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [state, router]);

  async function request() {
    setState("sending");
    setMessage(null);
    try {
      const res = await fetch(`/api/v1/matches/${matchId}/parse`, { method: "POST" });
      if (res.ok) {
        started.current = Date.now();
        setState("waiting");
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      setMessage(body?.error?.message ?? t("matches.parse.requestFailed"));
      setState("error");
    } catch {
      setMessage(t("matches.parse.offline"));
      setState("error");
    }
  }

  if (state === "waiting" || state === "slow") {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {state === "waiting" ? t("matches.parse.requested") : t("matches.parse.slow")}
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="gap-2"
        disabled={state === "sending"}
        onClick={() => void request()}
      >
        <ScanSearch aria-hidden className="size-4" />
        {state === "sending" ? t("matches.parse.requesting") : t("matches.parse.request")}
      </Button>
      {message && (
        <p role="alert" className="text-sm text-loss">
          {message}
        </p>
      )}
    </div>
  );
}
