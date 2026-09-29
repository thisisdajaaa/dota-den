import { cn } from "cn";
import { compositionFeedback, type FeedbackHero } from "../domain/composition-feedback";
import type { Side } from "../domain/draft-state";
import type { DraftHero } from "./types";

const CATEGORY: Record<string, string> = {
  control: "Control",
  initiation: "Initiation",
  durability: "Durability",
  push: "Pushing",
  damage_profile: "Damage mix",
  carry_core: "Late game",
  support: "Support",
  range: "Range",
};

const LEVEL = {
  strong: { label: "Strong", className: "border-win/40 bg-win/10 text-win" },
  ok: { label: "OK", className: "border-white/15 bg-white/[0.04] text-foreground" },
  weak: { label: "Weak", className: "border-loss/40 bg-loss/10 text-loss" },
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
  const enough = picks.length >= MIN_PICKS_FOR_FEEDBACK;
  const findings = enough
    ? compositionFeedback(picks.map(toFeedbackHero).filter((h): h is FeedbackHero => h !== null))
    : [];
  const missing = MIN_PICKS_FOR_FEEDBACK - picks.length;
  return (
    <section
      className="panel p-4"
      aria-label={`${side === "radiant" ? "Radiant" : "Dire"} composition feedback`}
    >
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <span
          aria-hidden
          className={cn("h-4 w-1 rounded-full", side === "radiant" ? "bg-win" : "bg-loss")}
        />
        {side === "radiant" ? "Radiant" : "Dire"} lineup
        {enough && picks.length < 5 && (
          <span className="font-normal text-muted-foreground">
            · based on {picks.length} of 5 picks
          </span>
        )}
      </h3>
      {findings.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {picks.length === 0
            ? "Feedback appears once this team has a few heroes."
            : `Pick ${missing} more hero${missing === 1 ? "" : "es"} to see lineup feedback.`}
        </p>
      ) : (
        <ul className="space-y-2.5">
          {findings.map((f) => (
            <li key={f.category} className="flex gap-3 text-sm">
              <span
                className={cn(
                  "mt-0.5 h-5 w-14 shrink-0 rounded border text-center text-[0.65rem] leading-5 font-semibold",
                  LEVEL[f.level].className,
                )}
              >
                {LEVEL[f.level].label}
              </span>
              <span>
                <span className="font-medium">{CATEGORY[f.category] ?? f.category}: </span>
                <span className="text-muted-foreground">
                  {f.reason.replace(/\s*\(based on \d+ of \d+ picks\)\.?$/, "")}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
