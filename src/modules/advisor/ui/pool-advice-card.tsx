import Link from "next/link";
import type { HeroInfo } from "@/modules/matches/domain/read-models";
import { formatPercent } from "@/modules/matches/ui/format";
import { HeroPortrait, heroName } from "@/modules/matches/ui/hero-portrait";
import { POSITION_INFO } from "@/modules/meta/domain/position";
import { MetaSection, Unavailable } from "@/modules/meta/ui/meta-section";
import type { PoolAdviceView } from "../dtos/responses/pool-advice.dto";

const MIN_CONTEST = 0.15;

/** "Heroes to add": suggestions for your role, each with the numbers behind it. */
export function PoolAdviceCard({
  view,
  heroes,
}: {
  view: PoolAdviceView;
  heroes: Map<number, HeroInfo>;
}) {
  const name = (id: number) => heroName(heroes.get(id), id);
  if (view.status !== "ok") {
    return (
      <MetaSection id="pool-advice" kicker="Your pool" title="Heroes to add">
        <Unavailable>
          {view.status === "no_role"
            ? "Play a few more games with lane data so we can tell which role you play."
            : "Suggestions are unavailable right now. Try again in a few minutes."}
        </Unavailable>
      </MetaSection>
    );
  }
  const pos = POSITION_INFO[view.position];
  return (
    <MetaSection
      id="pool-advice"
      kicker={`Your pool · ${pos.short} · ${pos.name}`}
      title="Heroes to add"
      description={
        view.nemeses.length > 0 ? (
          <>
            Strong at high ranks for your role, favouring heroes that beat the ones you lose to
            most:{" "}
            {view.nemeses.map((n, i) => (
              <span key={n.heroId}>
                {i > 0 && ", "}
                <span className="text-foreground">{name(n.heroId)}</span>
              </span>
            ))}
            .
          </>
        ) : (
          "Strong at high ranks for your role, and not already in your pool."
        )
      }
      footer={`From your last ${view.windowDays} days, recent high-rank games and pro games. Win rates from small samples are pulled toward 50%.`}
    >
      {view.advice.length === 0 ? (
        <Unavailable>
          No suggestions: you already play the strongest heroes for your role.
        </Unavailable>
      ) : (
        <ul className="divide-y divide-white/[0.05] border-t border-white/[0.06]">
          {view.advice.map((a) => (
            <li key={a.heroId}>
              <Link
                href={`/guides/${a.heroId}`}
                className="group flex gap-3 px-5 py-3 hover:bg-white/[0.03]"
              >
                <HeroPortrait hero={heroes.get(a.heroId)} heroId={a.heroId} size="md" />
                <span className="min-w-0 flex-1 space-y-0.5">
                  <span className="block font-medium group-hover:text-gold">{name(a.heroId)}</span>
                  <ul className="space-y-0.5 text-xs text-muted-foreground">
                    {a.counters.slice(0, 2).map((c) => (
                      <li key={c.nemesisId}>
                        Beats <span className="text-foreground">{name(c.nemesisId)}</span>:{" "}
                        {formatPercent(c.winRate)} in {c.games.toLocaleString("en-US")} pro games
                        (you lose to {name(c.nemesisId)} {formatPercent(c.yourLossRate)} of the
                        time)
                      </li>
                    ))}
                    {a.highRank && (
                      <li>
                        {formatPercent(a.highRank.rate)} win rate at high ranks (
                        {a.highRank.games.toLocaleString("en-US")} games)
                      </li>
                    )}
                    {a.contestRate !== null && a.contestRate >= MIN_CONTEST && (
                      <li>Picked or banned in {formatPercent(a.contestRate)} of pro drafts</li>
                    )}
                    {a.yourGames > 0 && (
                      <li>
                        You&apos;ve played it {a.yourGames} {a.yourGames === 1 ? "time" : "times"}{" "}
                        lately
                      </li>
                    )}
                  </ul>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </MetaSection>
  );
}
