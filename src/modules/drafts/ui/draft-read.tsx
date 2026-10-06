import { cn } from "cn";
import { getT } from "@/common/i18n/server";
import type { DraftOutlook } from "../domain/draft-outlook";
import { sayOr } from "./i18n";

/**
 * The draft outlook and report card for two lineups (a live game or a finished match), with
 * a line on how the game itself went. Same data and grades as the draft trainer.
 */
export async function DraftRead({
  outlook,
  name,
  outcome,
}: {
  outlook: DraftOutlook;
  name: (s: "radiant" | "dire") => string;
  /** Who's ahead (live) or who won (finished), compared with the draft. */
  outcome: (favoured: "radiant" | "dire" | null) => string;
}) {
  const t = await getT();
  const r = outlook.radiantPct ?? 50;
  const favoured = r > 50 ? "radiant" : r < 50 ? "dire" : null;
  return (
    <section aria-labelledby="draft-read" className="panel space-y-4 p-5">
      <div>
        <h2 id="draft-read" className="text-lg font-semibold">
          {t("drafts.read.title")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {favoured
            ? t("drafts.read.favours", {
                side: name(favoured),
                pct: favoured === "radiant" ? r : 100 - r,
              })
            : t("drafts.read.even")}{" "}
          {outcome(favoured)}
        </p>
      </div>
      <div
        className="flex h-2.5 overflow-hidden rounded-full bg-white/[0.06]"
        role="img"
        aria-label={t("drafts.read.barLabel", {
          radiant: name("radiant"),
          rpct: r,
          dire: name("dire"),
          dpct: 100 - r,
        })}
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
                    <span className="text-foreground">{t(`drafts.report.criteria.${c.key}`)}</span>{" "}
                    {c.grade ?? "—"}: {sayOr(t, c.summaryPhrase, c.summary)}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      {outlook.notes.length > 0 && (
        <ul className="space-y-1 text-sm">
          {outlook.notes.slice(0, 4).map((n, i) => (
            <li key={n} className="flex gap-2">
              <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-gold" />
              {sayOr(t, outlook.notePhrases?.[i], n)}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        {t("drafts.read.footnote", { pct: Math.round(outlook.accuracy.fitted * 100) })}
      </p>
    </section>
  );
}
