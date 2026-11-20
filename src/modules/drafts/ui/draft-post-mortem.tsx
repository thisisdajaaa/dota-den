import Link from "next/link";
import { cn } from "cn";
import { getT } from "@/common/i18n/server";
import type { PostMortem, SwingPhase } from "../domain/draft-post-mortem";

const gold = (n: number) =>
  Math.abs(n) >= 1_000 ? `${(Math.abs(n) / 1_000).toFixed(1)}k` : String(Math.abs(Math.round(n)));

/**
 * Plus: the draft's read set against what happened in the game (lanes at 10 minutes, where
 * the gold lead was won, the counters the draft liked). Free players see what it is and where
 * to get it.
 */
export async function DraftPostMortem({
  pm,
  heroName,
  sideName,
  locked,
}: {
  pm: PostMortem;
  heroName: (heroId: number) => string;
  sideName: (s: "radiant" | "dire") => string;
  locked: boolean;
}) {
  const t = await getT();
  const heroes = (ids: number[]) => ids.map(heroName).join(", ");
  const phase = (p: SwingPhase) => t(`drafts.postMortem.phases.${p}`);
  return (
    <section aria-labelledby="draft-post-mortem" className="panel space-y-4 p-5">
      <div>
        <p className="kicker">{t("drafts.postMortem.kicker")}</p>
        <h2 id="draft-post-mortem" className="text-lg font-semibold">
          {t("drafts.postMortem.title")}
        </h2>
      </div>
      {locked ? (
        <p className="text-sm text-muted-foreground">
          {t("drafts.postMortem.locked")}{" "}
          <Link href="/plus" className="font-medium text-gold hover:underline">
            {t("drafts.postMortem.lockedLink")}
          </Link>
        </p>
      ) : (
        <>
          <p className="text-sm">
            {t("drafts.postMortem.summary", { side: sideName(pm.winner), min: pm.durationMin })}
            {pm.decidedIn && pm.swings && (
              <>
                {" "}
                {t("drafts.postMortem.decided", {
                  phase: phase(pm.decidedIn),
                  gold: gold(pm.swings.find((s) => s.phase === pm.decidedIn)!.radiantChange),
                })}
              </>
            )}
            {pm.comeback && (
              <>
                {" "}
                {t("drafts.postMortem.comeback", {
                  gold: gold(pm.comeback.gold),
                  min: pm.comeback.minute,
                })}
              </>
            )}
            {pm.leadForGoodFrom !== null && (
              <>
                {" "}
                {pm.leadForGoodFrom <= 2
                  ? t("drafts.postMortem.ledThroughout")
                  : t("drafts.postMortem.leadForGood", { min: pm.leadForGoodFrom })}
              </>
            )}
          </p>

          {pm.lanes && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[30rem] text-sm">
                <caption className="mb-2 text-left text-sm font-semibold">
                  {t("drafts.postMortem.lanes.title")}
                </caption>
                <thead>
                  <tr className="border-y border-white/[0.06] text-left text-xs text-muted-foreground">
                    <th scope="col" className="py-2 pr-2 font-medium">
                      {t("drafts.postMortem.lanes.lane")}
                    </th>
                    <th scope="col" className="px-2 py-2 font-medium">
                      {t("drafts.postMortem.lanes.heroes")}
                    </th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">
                      {t("drafts.postMortem.lanes.gold")}
                    </th>
                    <th scope="col" className="py-2 pl-2 font-medium">
                      {t("drafts.postMortem.lanes.draft")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {pm.lanes.map((l) => (
                    <tr key={l.lane}>
                      <th scope="row" className="py-2 pr-2 text-left font-normal">
                        {t(`drafts.phrases.lanes.${l.lane}`)}
                      </th>
                      <td className="px-2 py-2 text-xs">
                        <span className="text-win">{heroes(l.radiant)}</span>
                        <span className="text-muted-foreground"> vs </span>
                        <span className="text-loss">{heroes(l.dire)}</span>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {l.winner
                          ? t("drafts.postMortem.lanes.ahead", {
                              side: sideName(l.winner),
                              gold: gold(l.goldDiff),
                            })
                          : t("drafts.postMortem.lanes.even")}
                      </td>
                      <td
                        className={cn(
                          "py-2 pl-2 text-xs",
                          l.verdict === "as_drafted" && "text-win",
                          l.verdict === "against_draft" && "text-loss",
                          l.verdict === "no_read" && "text-muted-foreground",
                        )}
                      >
                        {l.verdict === "no_read"
                          ? l.expected
                            ? t("drafts.postMortem.lanes.expectedOnly", {
                                side: sideName(l.expected),
                              })
                            : t("drafts.postMortem.lanes.noRead")
                          : t(`drafts.postMortem.lanes.${l.verdict}`, {
                              side: sideName(l.expected!),
                            })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {pm.swings && (
            <div>
              <h3 className="mb-2 text-sm font-semibold">{t("drafts.postMortem.swings.title")}</h3>
              <ul className="space-y-1.5 text-sm">
                {pm.swings.map((s) => {
                  const side = s.radiantChange >= 0 ? "radiant" : "dire";
                  return (
                    <li key={s.phase} className="flex flex-wrap items-baseline gap-x-2">
                      <span className="w-40 shrink-0 text-muted-foreground">
                        {t(`drafts.postMortem.phaseLabels.${s.phase}`)}{" "}
                        <span className="tabular-nums">
                          ({s.fromMinute}–{s.toMinute}′)
                        </span>
                      </span>
                      <span
                        className={cn(
                          "tabular-nums",
                          Math.abs(s.radiantChange) < 500
                            ? "text-muted-foreground"
                            : side === "radiant"
                              ? "text-win"
                              : "text-loss",
                        )}
                      >
                        {Math.abs(s.radiantChange) < 500
                          ? t("drafts.postMortem.swings.even")
                          : t("drafts.postMortem.swings.gained", {
                              side: sideName(side),
                              gold: gold(s.radiantChange),
                            })}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {pm.counters.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold">
                {t("drafts.postMortem.counters.title")}
              </h3>
              <ul className="space-y-1.5 text-sm">
                {pm.counters.map((c) => {
                  const kda = (h: typeof c.hero) =>
                    `${h.kills}/${h.deaths}/${h.assists}${h.netWorth !== null ? ` · ${gold(h.netWorth)}` : ""}`;
                  return (
                    <li key={c.side}>
                      {t("drafts.postMortem.counters.line", {
                        hero: heroName(c.hero.heroId),
                        vs: heroName(c.vs.heroId),
                        edge: c.edge.toFixed(1),
                      })}{" "}
                      <span className="text-muted-foreground tabular-nums">
                        {heroName(c.hero.heroId)} {kda(c.hero)}; {heroName(c.vs.heroId)} {kda(c.vs)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {!pm.lanes && !pm.swings && (
            <p className="text-sm text-muted-foreground">{t("drafts.postMortem.needsParse")}</p>
          )}
          <p className="text-xs text-muted-foreground">{t("drafts.postMortem.footnote")}</p>
        </>
      )}
    </section>
  );
}
