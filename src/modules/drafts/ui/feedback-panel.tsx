"use client";

import { cn } from "cn";
import { useT } from "@/common/i18n/client";
import { plural } from "@/common/i18n/translate";
import { compositionFeedback, type FeedbackHero } from "../domain/composition-feedback";
import type { Side } from "../domain/draft-state";
import { say, sideName } from "./i18n";
import type { DraftHero } from "./types";

const LEVEL = {
  strong: "border-win/40 bg-win/10 text-win",
  ok: "border-white/15 bg-white/[0.04] text-foreground",
  weak: "border-loss/40 bg-loss/10 text-loss",
} as const;

function toFeedbackHero(h: DraftHero): FeedbackHero | null {
  if (!h.primaryAttr || !h.attackType) return null;
  return {
    id: h.id,
    name: h.name,
    roles: h.roles,
    attackType: h.attackType,
    primaryAttr: h.primaryAttr,
  };
}

/** With fewer picks every category reads as "weak", which is noise rather than advice. */
export const MIN_PICKS_FOR_FEEDBACK = 3;

/** Rule-based, explainable feedback per team. Never a win probability. */
export function FeedbackPanel({ side, picks }: { side: Side; picks: DraftHero[] }) {
  const t = useT();
  const enough = picks.length >= MIN_PICKS_FOR_FEEDBACK;
  const findings = enough
    ? compositionFeedback(picks.map(toFeedbackHero).filter((h): h is FeedbackHero => h !== null))
    : [];
  const missing = MIN_PICKS_FOR_FEEDBACK - picks.length;
  return (
    <section
      className="panel p-4"
      aria-label={t("drafts.feedback.label", { side: sideName(t, side) })}
    >
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <span
          aria-hidden
          className={cn("h-4 w-1 rounded-full", side === "radiant" ? "bg-win" : "bg-loss")}
        />
        {t("drafts.feedback.title", { side: sideName(t, side) })}
        {enough && picks.length < 5 && (
          <span className="font-normal text-muted-foreground">
            {t("drafts.feedback.basedOn", { n: picks.length })}
          </span>
        )}
      </h3>
      {findings.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {picks.length === 0
            ? t("drafts.feedback.empty")
            : plural(t, "drafts.feedback.more", missing)}
        </p>
      ) : (
        <ul className="space-y-2.5">
          {findings.map((f) => (
            <li key={f.category} className="flex gap-3 text-sm">
              <span
                className={cn(
                  "mt-0.5 h-5 w-14 shrink-0 rounded border text-center text-[0.65rem] leading-5 font-semibold",
                  LEVEL[f.level],
                )}
              >
                {t(`drafts.feedback.levels.${f.level}`)}
              </span>
              <span>
                <span className="font-medium">
                  {t(`drafts.feedback.categories.${f.category}`)}:{" "}
                </span>
                <span className="text-muted-foreground">{say(t, f.phrase)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
