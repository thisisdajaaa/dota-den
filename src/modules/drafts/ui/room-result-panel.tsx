"use client";

import Link from "next/link";
import { History, Trophy } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { LocalTime } from "@/components/local-time";
import { Button } from "@/components/ui/button";
import type { RoomResultView } from "../application/history-views";
import type { RoomView } from "../application/room-views";
import type { ReportedWinner } from "../domain/draft-history";

const POLL_MS = 5_000;

const OPTIONS: { value: ReportedWinner; label: string }[] = [
  { value: "radiant", label: "Radiant won" },
  { value: "dire", label: "Dire won" },
  { value: "not_played", label: "We didn't play it" },
];

export function winnerLabel(winner: ReportedWinner): string {
  return OPTIONS.find((o) => o.value === winner)?.label ?? winner;
}

/**
 * "Who won the game?" for a finished room. Either captain reports the real game's result
 * (self-reported, not checked against match data); both see it, and it can be changed.
 */
export function RoomResultPanel({ room }: { room: RoomView }) {
  const [result, setResult] = useState<RoomResultView | null>(null);
  const [busy, setBusy] = useState(false);
  const mySeat = room.viewer.seat;
  const friend = mySeat ? room.captains[mySeat === "radiant" ? "dire" : "radiant"] : null;

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/drafts/rooms/${room.id}/result`, { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as { result: RoomResultView };
      setResult(body.result);
    } catch {
      // The room poll already shows the connection state.
    }
  }, [room.id]);

  // Poll slowly so a result the other captain reports shows up here too.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const loop = async () => {
      if (!document.hidden) await load();
      timer = setTimeout(loop, POLL_MS);
    };
    void loop();
    return () => clearTimeout(timer);
  }, [load]);

  async function report(winner: ReportedWinner) {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/drafts/rooms/${room.id}/result`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ winner }),
      });
      const body = (await res.json().catch(() => null)) as {
        result?: RoomResultView;
        error?: { message?: string };
      } | null;
      if (!res.ok || !body?.result) {
        toast.error(body?.error?.message ?? "Couldn't save the result.");
        return;
      }
      setResult(body.result);
      toast.success("Result saved");
    } catch {
      toast.error("Network error. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel space-y-3 p-4" aria-label="Game result">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Trophy aria-hidden className="size-4 text-gold" /> Who won the game?
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Self-reported by the captains after playing this draft. Dota Den doesn&apos;t check it
            against match data.
          </p>
        </div>
        {friend && (
          <Link
            href={`/draft/rooms/history?friend=${friend.accountId32}`}
            className="inline-flex items-center gap-1.5 text-sm text-gold hover:underline"
          >
            <History aria-hidden className="size-3.5" /> Your drafts with {friend.name}
          </Link>
        )}
      </div>

      <p className="text-sm" role="status">
        {result === null ? (
          <span className="text-muted-foreground">Loading…</span>
        ) : result.winner ? (
          <>
            <span
              className={cn(
                "font-semibold",
                result.winner === "radiant" && "text-win",
                result.winner === "dire" && "text-loss",
              )}
            >
              {winnerLabel(result.winner)}
            </span>
            <span className="text-muted-foreground">
              {" "}
              · reported by {result.setByName}
              {result.setAt && (
                <>
                  {" "}
                  on <LocalTime iso={result.setAt} />
                </>
              )}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">No result reported yet.</span>
        )}
      </p>

      {result?.canReport && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Report the result">
          {OPTIONS.map((o) => (
            <Button
              key={o.value}
              size="sm"
              variant={result.winner === o.value ? "default" : "outline"}
              aria-pressed={result.winner === o.value}
              disabled={busy}
              onClick={() => report(o.value)}
            >
              {o.label}
            </Button>
          ))}
        </div>
      )}
    </section>
  );
}
