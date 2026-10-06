"use client";

import { cn } from "cn";
import { useT } from "@/common/i18n/client";
import type { DraftTurnRecord, Side } from "../domain/draft-state";
import type { DraftStep } from "../domain/rulesets";
import { actionName, sideName } from "./i18n";
import type { DraftHero } from "./types";

/** The whole pick/ban order at a glance; done steps show the hero, the current one glows. */
export function SequenceStrip({
  sequence,
  firstSide,
  turns,
  stepIndex,
  heroes,
}: {
  sequence: readonly DraftStep[];
  firstSide: Side;
  turns: readonly DraftTurnRecord[];
  stepIndex: number;
  heroes: Map<number, DraftHero>;
}) {
  const t = useT();
  const other: Side = firstSide === "radiant" ? "dire" : "radiant";
  return (
    <ol aria-label={t("drafts.sequence.label")} className="flex gap-1 overflow-x-auto pb-1">
      {sequence.map((step, i) => {
        const side = step.team === "first" ? firstSide : other;
        const done = turns[i];
        const hero = done?.heroId ? heroes.get(done.heroId) : undefined;
        const current = i === stepIndex;
        return (
          <li
            key={i}
            aria-current={current ? "step" : undefined}
            title={`${t("drafts.sequence.step", {
              n: i + 1,
              side: sideName(t, side),
              action: actionName(t, step.action),
            })}${hero ? `: ${hero.name}` : done ? t("drafts.sequence.skipped") : ""}`}
            className={cn(
              "relative flex h-10 w-8 shrink-0 flex-col items-center justify-end overflow-hidden rounded border text-[0.55rem] font-bold uppercase",
              side === "radiant" ? "border-win/40" : "border-loss/40",
              step.action === "ban" ? "bg-black/40" : "bg-white/[0.04]",
              current && "border-gold ring-1 ring-gold",
              i > stepIndex && "opacity-50",
            )}
          >
            {hero?.iconUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- tiny icon
              <img
                src={hero.iconUrl}
                alt=""
                className={cn(
                  "absolute inset-0 size-full object-cover",
                  step.action === "ban" && "grayscale",
                )}
              />
            )}
            <span
              className={cn(
                "relative mb-0.5 rounded px-0.5",
                hero ? "bg-black/70" : "",
                side === "radiant" ? "text-win" : "text-loss",
              )}
            >
              {step.action === "ban"
                ? t("drafts.sequence.banLetter")
                : t("drafts.sequence.pickLetter")}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
