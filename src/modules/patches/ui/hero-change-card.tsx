import { SafeImage } from "@/components/safe-image";
import type { HeroInfo } from "@/modules/matches/application/ports";
import { formatPercent } from "@/modules/matches/ui/format";
import { HeroPortrait, heroName } from "@/modules/matches/ui/hero-portrait";
import type { HeroPatchNotes } from "../domain/patch";
import { steamCdn } from "./cdn";
import { NoteList } from "./note-list";

export interface HeroCohort {
  before: { games: number; wins: number };
  after: { games: number; wins: number };
}

const MIN_COHORT = 5;

function Cohort({ cohort }: { cohort: HeroCohort }) {
  const rate = (c: { games: number; wins: number }) => (c.games ? c.wins / c.games : null);
  const enough = cohort.before.games >= MIN_COHORT && cohort.after.games >= MIN_COHORT;
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-xs">
      <div className="mb-1.5 font-semibold text-foreground">Your ranked games on this hero</div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-muted-foreground">30 days before</div>
          <div className="text-base font-semibold tabular-nums">
            {formatPercent(rate(cohort.before))}
          </div>
          <div className="text-muted-foreground">{cohort.before.games} games</div>
        </div>
        <div>
          <div className="text-muted-foreground">Since this patch</div>
          <div className="text-base font-semibold tabular-nums">
            {formatPercent(rate(cohort.after))}
          </div>
          <div className="text-muted-foreground">{cohort.after.games} games</div>
        </div>
      </div>
      <p className="mt-2 text-muted-foreground">
        {enough
          ? "Other things change too (teammates, the meta, your role), so treat this as a hint, not proof."
          : `Not enough games on both sides yet (${MIN_COHORT}+ each) to compare.`}
      </p>
    </div>
  );
}

export function HeroChangeCard({
  change,
  hero,
  cohort,
  action,
}: {
  change: HeroPatchNotes;
  hero: HeroInfo | undefined;
  cohort?: HeroCohort;
  action?: React.ReactNode;
}) {
  const name = heroName(hero, change.heroId);
  return (
    <article
      id={`hero-${change.heroId}`}
      className="panel scroll-mt-24 p-5"
      aria-labelledby={`hero-${change.heroId}-name`}
    >
      <header className="mb-4 flex items-center gap-3">
        <HeroPortrait hero={hero} heroId={change.heroId} size="lg" />
        <h3 id={`hero-${change.heroId}-name`} className="flex-1 text-lg font-semibold">
          {name}
        </h3>
        {action}
      </header>
      <div className="space-y-4">
        <NoteList notes={change.heroNotes} />
        {change.abilities.map((a) => {
          const icon = steamCdn(a.iconPath);
          return (
            <section key={a.abilityId} className="flex gap-3">
              <span className="relative mt-0.5 size-9 shrink-0 overflow-hidden rounded-md bg-muted ring-1 ring-white/10">
                {icon && <SafeImage src={icon} alt="" fill sizes="36px" className="object-cover" />}
              </span>
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-semibold">
                  {a.abilityName ?? `Ability #${a.abilityId}`}
                </h4>
                <NoteList notes={a.notes} className="mt-1" />
              </div>
            </section>
          );
        })}
        {change.talentNotes.length > 0 && (
          <section>
            <h4 className="mb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Talents
            </h4>
            <NoteList notes={change.talentNotes} />
          </section>
        )}
        {cohort && cohort.before.games + cohort.after.games > 0 && <Cohort cohort={cohort} />}
      </div>
    </article>
  );
}
