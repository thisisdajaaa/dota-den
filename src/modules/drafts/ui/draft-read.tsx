import { cn } from "cn";
import type { DraftOutlook } from "../domain/draft-outlook";

/**
 * The draft outlook and report card for two lineups (a live game or a finished match), with
 * a line on how the game itself went. Same data and grades as the draft trainer.
 */
export function DraftRead({
  outlook,
  name,
  outcome,
}: {
  outlook: DraftOutlook;
  name: (s: "radiant" | "dire") => string;
  /** Who's ahead (live) or who won (finished), compared with the draft. */
  outcome: (favoured: "radiant" | "dire" | null) => string;
}) {
  const r = outlook.radiantPct ?? 50;
  const favoured = r > 50 ? "radiant" : r < 50 ? "dire" : null;
  return (
    <section aria-labelledby="draft-read" className="panel space-y-4 p-5">
      <div>
        <h2 id="draft-read" className="text-lg font-semibold">
          The draft
        </h2>
        <p className="text-sm text-muted-foreground">
          {favoured
            ? `The draft favours ${name(favoured)} (${favoured === "radiant" ? r : 100 - r}%).`
            : "The draft looks even."}{" "}
          {outcome(favoured)}
        </p>
      </div>
      <div
        className="flex h-2.5 overflow-hidden rounded-full bg-white/[0.06]"
        role="img"
        aria-label={`Estimated win chance from the draft: ${name("radiant")} ${r}%, ${name("dire")} ${100 - r}%`}
      >
        <span className="bg-win/80" style={{ width: `${r}%` }} />
        <span className="bg-loss/80" style={{ width: `${100 - r}%` }} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {(["radiant", "dire"] as const).map((s) => {
          const rep = outlook.report[s];
          return (
            <div key={s} className="rounded-lg border border-white/[0.06] p-3">
              <p
                className={cn("text-sm font-semibold", s === "radiant" ? "text-win" : "text-loss")}
              >
                {name(s)}: {rep.grade ?? "—"}
                {rep.overall !== null && (
                  <span className="text-xs font-normal text-muted-foreground">
                    {" "}
                    {rep.overall}/100
                  </span>
                )}
              </p>
              <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                {rep.criteria.map((c) => (
                  <li key={c.key}>
                    <span className="text-foreground">{c.label}</span> {c.grade ?? "—"}: {c.summary}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      {outlook.notes.length > 0 && (
        <ul className="space-y-1 text-sm">
          {outlook.notes.slice(0, 4).map((n) => (
            <li key={n} className="flex gap-2">
              <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-gold" />
              {n}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        Estimated from the draft alone, with the same data and report card as the draft trainer. It
        picked the winner {Math.round(outlook.accuracy.fitted * 100)}% of the time on recent
        high-rank games it hadn&apos;t seen, so treat it as a read, not a prediction.
      </p>
    </section>
  );
}
