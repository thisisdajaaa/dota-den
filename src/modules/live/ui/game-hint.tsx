"use client";

import Link from "next/link";
import { Swords } from "lucide-react";
import { cn } from "cn";
import { useT } from "@/common/i18n/client";
import { hintLabel } from "../domain/streams";
import type { StreamGameHint } from "../domain/watch";

/**
 * The live game a stream's title seems to be about, linking to its page. Always labelled as a
 * guess: nothing ties a broadcast to a match except what its title says.
 */
export function GameHint({ hint, className }: { hint: StreamGameHint; className?: string }) {
  const t = useT();
  const label = hintLabel(hint);
  const match = !label
    ? t("live.hub.hint.liveGame")
    : label.kind === "versus"
      ? t("live.versus", { radiant: label.radiant, dire: label.dire })
      : label.name;
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-[0.65rem] tracking-wide text-muted-foreground uppercase">
        {t("live.hub.hint.label")}
      </p>
      <Link
        href={`/live/${hint.matchId}`}
        aria-label={t("live.hub.hint.open", { match })}
        title={t("live.hub.hint.why", { names: hint.mentions.join(", ") })}
        className="relative mt-0.5 inline-flex max-w-full items-center gap-1.5 rounded-md bg-gold/10 px-2 py-1 text-xs font-medium text-gold ring-1 ring-gold/20 transition-colors outline-none hover:bg-gold/15 focus-visible:ring-3 focus-visible:ring-ring/50 touch:tap-area"
      >
        <Swords aria-hidden className="size-3.5 shrink-0" />
        <span className="truncate">{match}</span>
      </Link>
    </div>
  );
}
