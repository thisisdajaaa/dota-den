import Link from "next/link";
import { cn } from "cn";
import { getT } from "@/common/i18n/server";
import type { HeroInfo } from "../matches.ports";
import type { MatchSummary } from "../domain/match-summary";
import { heroName } from "./hero-portrait";

export async function FormStrip({
  form,
  heroes,
}: {
  form: MatchSummary["form"];
  heroes: Map<number, HeroInfo>;
}) {
  const t = await getT();
  const wins = form.filter((f) => f.result === "win").length;
  return (
    <section className="panel p-5" aria-labelledby="form">
      <div className="mb-4 flex items-baseline justify-between">
        <div>
          <p className="kicker">{t("matches.form.kicker")}</p>
          <h2 id="form" className="text-lg font-semibold">
            {t("matches.form.title", { n: form.length })}
          </h2>
        </div>
        <span className="text-sm tabular-nums">
          <span className="font-semibold text-win">{t("matches.form.winsShort", { n: wins })}</span>
          <span className="text-muted-foreground"> · </span>
          <span className="font-semibold text-loss">
            {t("matches.form.lossesShort", { n: form.length - wins })}
          </span>
        </span>
      </div>
      {/* Reads like a timeline: oldest top-left, newest bottom-right. */}
      <ol className="grid grid-cols-10 gap-1.5">
        {[...form].reverse().map((f) => {
          const hero = heroes.get(f.heroId);
          const win = f.result === "win";
          const result = win ? t("matches.result.win") : t("matches.result.loss");
          const name = heroName(hero, f.heroId);
          return (
            <li key={f.matchId}>
              <Link
                href={`/matches/${f.matchId}`}
                title={t("matches.form.tileTitle", { result, hero: name })}
                className={cn(
                  "group relative grid aspect-square w-full place-items-center overflow-hidden rounded-md text-xs font-bold ring-1 transition-transform hover:-translate-y-0.5 focus-visible:-translate-y-0.5",
                  win ? "text-win ring-win/40" : "text-loss ring-loss/40",
                )}
              >
                {hero?.iconUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- tiny decorative icon
                  <img
                    src={hero.iconUrl}
                    alt=""
                    className="absolute inset-0 size-full object-cover opacity-25 transition-opacity group-hover:opacity-50"
                  />
                )}
                <span className={cn("absolute inset-0", win ? "bg-win/10" : "bg-loss/10")} />
                <span className="relative drop-shadow">
                  {win ? t("matches.form.winLetter") : t("matches.form.lossLetter")}
                </span>
                <span className="sr-only">
                  {t("matches.form.tileLabel", { result, hero: name })}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
      <div className="mt-2 flex justify-between text-[0.65rem] tracking-wider text-muted-foreground uppercase">
        <span>{t("matches.form.older")}</span>
        <span>{t("matches.form.newest")}</span>
      </div>
    </section>
  );
}
