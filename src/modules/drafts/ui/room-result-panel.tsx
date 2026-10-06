"use client";

import { ApiClientError, apiRequest } from "@/common/http/api-client";
import { useT } from "@/common/i18n/client";
import Link from "next/link";
import { History, Trophy } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { LocalTime } from "@/components/local-time";
import { Button } from "@/components/ui/button";
import type { RoomResultView } from "../dtos/responses/history-views.dto";
import type { RoomView } from "../dtos/responses/room-views.dto";
import type { ReportedWinner } from "../domain/draft-history";
import type { T } from "./i18n";

const POLL_MS = 5_000;

const OPTIONS: ReportedWinner[] = ["radiant", "dire", "not_played"];

export function winnerLabel(t: T, winner: ReportedWinner): string {
  switch (winner) {
    case "radiant":
      return t("drafts.result.radiant");
    case "dire":
      return t("drafts.result.dire");
    case "not_played":
      return t("drafts.result.notPlayed");
    default:
      return winner;
  }
}

/**
 * "Who won the game?" for a finished room. Either captain reports the real game's result
 * (self-reported, not checked against match data); both see it, and it can be changed.
 */
export function RoomResultPanel({ room }: { room: RoomView }) {
  const t = useT();
  const [result, setResult] = useState<RoomResultView | null>(null);
  const [busy, setBusy] = useState(false);
  const mySeat = room.viewer.seat;
  const friend = mySeat ? room.captains[mySeat === "radiant" ? "dire" : "radiant"] : null;

  const load = useCallback(async () => {
    try {
      const body = await apiRequest<{ result: RoomResultView }>(
        `/api/v1/drafts/rooms/${room.id}/result`,
        { cache: "no-store" },
      );
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
      const body = await apiRequest<{ result: RoomResultView }>(
        `/api/v1/drafts/rooms/${room.id}/result`,
        { method: "POST", body: { winner } },
      );
      setResult(body.result);
      toast.success(t("drafts.result.saved"));
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : t("drafts.result.network"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel space-y-3 p-4" aria-label={t("drafts.result.label")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Trophy aria-hidden className="size-4 text-gold" /> {t("drafts.result.title")}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">{t("drafts.result.intro")}</p>
        </div>
        {friend && (
          <Link
            href={`/draft/rooms/history?friend=${friend.accountId32}`}
            className="inline-flex items-center gap-1.5 text-sm text-gold hover:underline"
          >
            <History aria-hidden className="size-3.5" />{" "}
            {t("drafts.result.withFriend", { name: friend.name })}
          </Link>
        )}
      </div>

      <p className="text-sm" role="status">
        {result === null ? (
          <span className="text-muted-foreground">{t("drafts.result.loading")}</span>
        ) : result.winner ? (
          <>
            <span
              className={cn(
                "font-semibold",
                result.winner === "radiant" && "text-win",
                result.winner === "dire" && "text-loss",
              )}
            >
              {winnerLabel(t, result.winner)}
            </span>
            <span className="text-muted-foreground">
              {t("drafts.result.reportedBy", { name: result.setByName ?? "" })}
              {result.setAt && (
                <>
                  {t("drafts.result.on")}
                  <LocalTime iso={result.setAt} />
                </>
              )}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">{t("drafts.result.none")}</span>
        )}
      </p>

      {result?.canReport && (
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("drafts.result.report")}>
          {OPTIONS.map((o) => (
            <Button
              key={o}
              size="sm"
              variant={result.winner === o ? "default" : "outline"}
              aria-pressed={result.winner === o}
              disabled={busy}
              onClick={() => report(o)}
            >
              {winnerLabel(t, o)}
            </Button>
          ))}
        </div>
      )}
    </section>
  );
}
