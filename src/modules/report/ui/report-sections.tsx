import Link from "next/link";
import { cn } from "cn";
import type { HeroInfo } from "@/modules/matches/domain/read-models";
import { formatPercent } from "@/modules/matches/ui/format";
import { HeroPortrait, heroName } from "@/modules/matches/ui/hero-portrait";
import {
  avgOf,
  type BattleReport,
  type PeriodTotals,
  type RecordStat,
} from "../domain/battle-report";
import { MIN_REPLAY_GAMES, type ReplayAggregate } from "../domain/replay-summary";

const RECORD_LABEL: Record<RecordStat, string> = {
  heroDamage: "Max hero damage",
  heroHealing: "Max hero healing",
  kills: "Max kills",
  goldPerMin: "Max GPM",
  xpPerMin: "Max XPM",
  deaths: "Max deaths",
  lastHits: "Max last hits",
  denies: "Max denies",
  assists: "Max assists",
  towerDamage: "Max tower damage",
};

const ROLE = { 1: "Safe lane", 2: "Mid", 3: "Off lane", 4: "Jungle" } as Record<number, string>;

export function SidesCard({ sides }: { sides: BattleReport["sides"] }) {
  const rate = (s: { games: number; wins: number }) => (s.games ? s.wins / s.games : null);
  const r = rate(sides.radiant);
  const d = rate(sides.dire);
  const diff = r !== null && d !== null ? r - d : null;
  return (
    <section className="panel space-y-3 p-5" aria-labelledby="report-sides">
      <h2 id="report-sides" className="text-lg font-semibold">
        Radiant vs Dire
      </h2>
      <div className="grid grid-cols-2 gap-4">
        {(["radiant", "dire"] as const).map((side) => {
          const s = sides[side];
          return (
            <div key={side}>
              <p
                className={cn("text-sm font-medium", side === "radiant" ? "text-win" : "text-loss")}
              >
                {side === "radiant" ? "Radiant" : "Dire"}
              </p>
              <p className="text-2xl font-semibold tabular-nums">{formatPercent(rate(s))}</p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {s.wins} wins · {s.games - s.wins} losses
              </p>
            </div>
          );
        })}
      </div>
      {diff !== null && Math.abs(diff) >= 0.01 && (
        <p className="text-sm text-muted-foreground">
          {(Math.abs(diff) * 100).toFixed(1)} points higher as {diff > 0 ? "Radiant" : "Dire"}.
        </p>
      )}
    </section>
  );
}

export function RecordsCard({
  records,
  heroes,
}: {
  records: BattleReport["records"];
  heroes: Map<number, HeroInfo>;
}) {
  return (
    <section className="panel space-y-3 p-5" aria-labelledby="report-records">
      <div>
        <h2 id="report-records" className="text-lg font-semibold">
          Your best games
        </h2>
        <p className="text-sm text-muted-foreground">
          The highest of each stat in a single game this period. Open one to see the match.
        </p>
      </div>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {records.map((r) => {
          const h = heroes.get(r.heroId);
          return (
            <li key={r.stat}>
              <Link
                href={`/matches/${r.matchId}`}
                aria-label={`${RECORD_LABEL[r.stat]}: ${r.value.toLocaleString("en-US")} on ${heroName(h, r.heroId)}, ${r.won ? "win" : "loss"}`}
                className="block space-y-1.5 rounded-lg border border-white/[0.06] p-3 hover:border-gold/40"
              >
                <p className="text-[0.7rem] tracking-wide text-muted-foreground uppercase">
                  {RECORD_LABEL[r.stat]}
                </p>
                <div className="flex items-center gap-2">
                  <HeroPortrait hero={h} heroId={r.heroId} size="xs" />
                  <span className="text-lg font-semibold tabular-nums">
                    {Math.round(r.value).toLocaleString("en-US")}
                  </span>
                </div>
                <p className={cn("text-xs font-medium", r.won ? "text-win" : "text-loss")}>
                  {r.won ? "Win" : "Loss"}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function HeroesCard({
  rows,
  heroes,
  limit = 10,
}: {
  rows: BattleReport["heroes"];
  heroes: Map<number, HeroInfo>;
  limit?: number;
}) {
  return (
    <section className="panel overflow-hidden" aria-labelledby="report-heroes">
      <h2 id="report-heroes" className="p-5 pb-3 text-lg font-semibold">
        Most played heroes
      </h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-y border-white/[0.06] text-left text-xs text-muted-foreground">
            <th scope="col" className="px-5 py-2 font-medium">
              Hero
            </th>
            <th scope="col" className="px-2 py-2 text-right font-medium">
              Games
            </th>
            <th scope="col" className="px-2 py-2 text-right font-medium">
              Win rate
            </th>
            <th scope="col" className="px-5 py-2 text-right font-medium">
              KDA
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.05]">
          {rows.slice(0, limit).map((r) => {
            const h = heroes.get(r.heroId);
            const rate = r.wins / r.games;
            return (
              <tr key={r.heroId}>
                <th scope="row" className="px-5 py-2 text-left font-normal">
                  <Link
                    href={`/heroes/${r.heroId}`}
                    className="flex items-center gap-2.5 hover:text-gold"
                  >
                    <HeroPortrait hero={h} heroId={r.heroId} size="xs" />
                    <span className="truncate">{heroName(h, r.heroId)}</span>
                  </Link>
                </th>
                <td className="px-2 py-2 text-right tabular-nums">{r.games}</td>
                <td
                  className={cn(
                    "px-2 py-2 text-right tabular-nums",
                    rate >= 0.5 ? "text-win" : "text-loss",
                  )}
                >
                  {formatPercent(rate)}
                </td>
                <td className="px-5 py-2 text-right text-muted-foreground tabular-nums">
                  {((r.kills + r.assists) / Math.max(1, r.deaths)).toFixed(2)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

export function RolesCard({ roles, games }: { roles: BattleReport["roles"]; games: number }) {
  return (
    <section className="panel space-y-3 p-5" aria-labelledby="report-roles">
      <div>
        <h2 id="report-roles" className="text-lg font-semibold">
          Roles
        </h2>
        <p className="text-sm text-muted-foreground">
          From the {roles.withData} of your {games} games with a parsed replay (lane data comes only
          from parsed replays).
        </p>
      </div>
      <ul className="space-y-2">
        {roles.byRole.map((r) => {
          const share = r.games / roles.withData;
          return (
            <li key={r.role} className="grid grid-cols-[6rem_1fr_auto] items-center gap-3 text-sm">
              <span>{ROLE[r.role]}</span>
              <span className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                <span className="block h-full bg-gold/70" style={{ width: `${share * 100}%` }} />
              </span>
              <span className="w-36 text-right text-xs text-muted-foreground tabular-nums">
                {Math.round(share * 100)}% of games · {formatPercent(r.wins / r.games)} wins
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Each day in the period: shade by games played, tint by result. */
export function CalendarCard({
  days,
  from,
  to,
}: {
  days: BattleReport["days"];
  from: string;
  to: string;
}) {
  const keys: string[] = [];
  for (let t = Date.parse(`${from}T12:00:00Z`); ; t += 86_400_000) {
    const k = new Date(t).toISOString().slice(0, 10);
    keys.push(k);
    if (k >= to) break;
  }
  const lead = new Date(`${from}T12:00:00Z`).getUTCDay(); // Sunday = 0
  const max = Math.max(1, ...[...days.values()].map((d) => d.games));
  const label = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const played = [...days.values()].filter((d) => d.games > 0).length;
  return (
    <section className="panel space-y-3 p-5" aria-labelledby="report-calendar">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="report-calendar" className="text-lg font-semibold">
          Calendar
        </h2>
        <p className="text-xs text-muted-foreground">
          Played on {played} of {keys.length} days · darker = more games
        </p>
      </div>
      <div className="overflow-x-auto">
        <div
          role="img"
          aria-label={`Games per day from ${label.format(new Date(`${from}T12:00:00Z`))} to ${label.format(new Date(`${to}T12:00:00Z`))}`}
          className="grid w-max grid-flow-col grid-rows-7 gap-1"
        >
          {Array.from({ length: lead }, (_, i) => (
            <span key={`pad${i}`} className="size-3" />
          ))}
          {keys.map((k) => {
            const d = days.get(k);
            const winning = d && d.wins * 2 >= d.games;
            const o = d ? 0.25 + (0.75 * d.games) / max : 0;
            return (
              <span
                key={k}
                title={
                  d
                    ? `${label.format(new Date(`${k}T12:00:00Z`))}: ${d.games} games, ${d.wins}–${d.games - d.wins}`
                    : label.format(new Date(`${k}T12:00:00Z`))
                }
                className={cn("size-3 rounded-[3px]", !d && "bg-white/[0.05]")}
                style={
                  d
                    ? {
                        backgroundColor: winning ? "var(--win)" : "var(--loss)",
                        opacity: o,
                      }
                    : undefined
                }
              />
            );
          })}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        <span className="mr-1 inline-block size-2.5 rounded-sm bg-win align-middle" /> more wins
        than losses ·{" "}
        <span className="mr-1 ml-1 inline-block size-2.5 rounded-sm bg-loss align-middle" /> more
        losses
      </p>
    </section>
  );
}

const signedPct = (d: number) =>
  `${d > 0 ? "+" : d < 0 ? "−" : "±"}${Math.abs(d * 100).toFixed(1)} pts`;
const signedNum = (d: number, digits = 0) =>
  `${d > 0 ? "+" : d < 0 ? "−" : "±"}${Math.abs(d).toFixed(digits)}`;

/** This period against the one of the same length just before it. */
export function CompareCard({
  current,
  previous,
  previousLabel,
}: {
  current: PeriodTotals;
  previous: PeriodTotals;
  previousLabel: string;
}) {
  const rows: Array<{
    label: string;
    now: string;
    before: string;
    delta: string | null;
    good: boolean | null;
  }> = [
    {
      label: "Games",
      now: String(current.games),
      before: String(previous.games),
      delta: signedNum(current.games - previous.games),
      good: null,
    },
    {
      label: "Win rate",
      now: current.winRate === null ? "—" : formatPercent(current.winRate),
      before: previous.winRate === null ? "—" : formatPercent(previous.winRate),
      delta:
        current.winRate !== null && previous.winRate !== null
          ? signedPct(current.winRate - previous.winRate)
          : null,
      good:
        current.winRate !== null && previous.winRate !== null
          ? current.winRate >= previous.winRate
          : null,
    },
    {
      label: "KDA",
      now: current.kda === null ? "—" : current.kda.toFixed(2),
      before: previous.kda === null ? "—" : previous.kda.toFixed(2),
      delta:
        current.kda !== null && previous.kda !== null
          ? signedNum(current.kda - previous.kda, 2)
          : null,
      good: current.kda !== null && previous.kda !== null ? current.kda >= previous.kda : null,
    },
    {
      label: "Gold per minute",
      now: current.gpm === null ? "—" : String(Math.round(current.gpm)),
      before: previous.gpm === null ? "—" : String(Math.round(previous.gpm)),
      delta:
        current.gpm !== null && previous.gpm !== null
          ? signedNum(current.gpm - previous.gpm)
          : null,
      good: current.gpm !== null && previous.gpm !== null ? current.gpm >= previous.gpm : null,
    },
  ];
  return (
    <section className="panel overflow-hidden" aria-labelledby="report-compare">
      <div className="p-5 pb-3">
        <h2 id="report-compare" className="text-lg font-semibold">
          Compared with the period before
        </h2>
        <p className="text-xs text-muted-foreground">{previousLabel}</p>
      </div>
      {previous.games === 0 ? (
        <p className="border-t border-white/[0.06] px-5 py-4 text-sm text-muted-foreground">
          No games in the period before, so there&apos;s nothing to compare.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-y border-white/[0.06] text-left text-xs text-muted-foreground">
              <th scope="col" className="px-5 py-2 font-medium">
                Stat
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                This period
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                Before
              </th>
              <th scope="col" className="px-5 py-2 text-right font-medium">
                Change
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {rows.map((r) => (
              <tr key={r.label}>
                <th scope="row" className="px-5 py-2 text-left font-normal">
                  {r.label}
                </th>
                <td className="px-2 py-2 text-right tabular-nums">{r.now}</td>
                <td className="px-2 py-2 text-right text-muted-foreground tabular-nums">
                  {r.before}
                </td>
                <td
                  className={cn(
                    "px-5 py-2 text-right tabular-nums",
                    r.good === true && "text-win",
                    r.good === false && "text-loss",
                  )}
                >
                  {r.delta ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** Every hero played in the period with record, KDA and average GPM/XPM. */
export function HeroTable({
  rows,
  heroes,
}: {
  rows: BattleReport["heroes"];
  heroes: Map<number, HeroInfo>;
}) {
  return (
    <section className="panel overflow-hidden" aria-labelledby="report-hero-table">
      <h2 id="report-hero-table" className="p-5 pb-3 text-lg font-semibold">
        Every hero this period
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="border-y border-white/[0.06] text-left text-xs text-muted-foreground">
              <th scope="col" className="px-5 py-2 font-medium">
                Hero
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                Games
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                Record
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                Win rate
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                KDA
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                GPM
              </th>
              <th scope="col" className="px-5 py-2 text-right font-medium">
                XPM
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {rows.map((r) => {
              const h = heroes.get(r.heroId);
              const rate = r.wins / r.games;
              const gpm = avgOf(r.gpm);
              const xpm = avgOf(r.xpm);
              return (
                <tr key={r.heroId}>
                  <th scope="row" className="px-5 py-2 text-left font-normal">
                    <Link
                      href={`/heroes/${r.heroId}`}
                      className="flex items-center gap-2.5 hover:text-gold"
                    >
                      <HeroPortrait hero={h} heroId={r.heroId} size="xs" />
                      <span className="truncate">{heroName(h, r.heroId)}</span>
                    </Link>
                  </th>
                  <td className="px-2 py-2 text-right tabular-nums">{r.games}</td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    <span className="text-win">{r.wins}</span>–
                    <span className="text-loss">{r.games - r.wins}</span>
                  </td>
                  <td
                    className={cn(
                      "px-2 py-2 text-right tabular-nums",
                      rate >= 0.5 ? "text-win" : "text-loss",
                    )}
                  >
                    {formatPercent(rate)}
                  </td>
                  <td className="px-2 py-2 text-right text-muted-foreground tabular-nums">
                    {((r.kills + r.assists) / Math.max(1, r.deaths)).toFixed(2)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {gpm === null ? "—" : Math.round(gpm)}
                  </td>
                  <td className="px-5 py-2 text-right tabular-nums">
                    {xpm === null ? "—" : Math.round(xpm)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SampleNote({ read, parsed }: { read: number; parsed: number }) {
  return (
    <p className="text-xs text-muted-foreground">
      From {read} parsed replay{read === 1 ? "" : "s"} ({parsed} of this period&apos;s games are
      parsed{read < parsed ? "; more are read each visit" : ""}).
    </p>
  );
}

/** Lanes won, drawn and lost (gold at 10 minutes against your lane opponents). */
export function LanesCard({
  replays,
}: {
  replays: { aggregate: ReplayAggregate; parsedInPeriod: number };
}) {
  const { lanes } = replays.aggregate;
  return (
    <section className="panel space-y-3 p-5" aria-labelledby="report-lanes">
      <div>
        <p className="kicker">Parsed replays</p>
        <h2 id="report-lanes" className="text-lg font-semibold">
          Lane results
        </h2>
        <SampleNote read={replays.aggregate.games} parsed={replays.parsedInPeriod} />
      </div>
      {lanes.games < MIN_REPLAY_GAMES ? (
        <p className="text-sm text-muted-foreground">
          Not enough parsed lanes yet ({lanes.games} of {MIN_REPLAY_GAMES} needed). Use “Get
          detailed stats” on a match page to have its replay parsed.
        </p>
      ) : (
        <>
          <p className="text-2xl font-semibold tabular-nums">
            {formatPercent(lanes.won / lanes.games)}{" "}
            <span className="text-sm font-normal text-muted-foreground">of lanes won</span>
          </p>
          <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm tabular-nums">
            <li>
              <span className="text-win">{lanes.won}</span> won
            </li>
            <li>{lanes.even} even</li>
            <li>
              <span className="text-loss">{lanes.lost}</span> lost
            </li>
          </ul>
          <p className="text-xs text-muted-foreground">
            A lane counts as won or lost when one side earned at least 10% more gold by minute 10.
            Roaming and jungle games aren&apos;t counted.
          </p>
        </>
      )}
    </section>
  );
}

/** Roshan, stacks, dewards and runes per game, from parsed replays. */
export function ObjectivesCard({
  replays,
}: {
  replays: { aggregate: ReplayAggregate; parsedInPeriod: number };
}) {
  const { games, totals } = replays.aggregate;
  const per = (n: number) => (games ? (n / games).toFixed(1) : "—");
  const rows = [
    { label: "Roshan kills", total: totals.roshanKills },
    { label: "Camps stacked", total: totals.campsStacked },
    { label: "Wards destroyed", total: totals.dewards },
    { label: "Power runes", total: totals.powerRunes },
    { label: "Bounty runes", total: totals.bountyRunes },
  ];
  return (
    <section className="panel space-y-3 p-5" aria-labelledby="report-objectives">
      <div>
        <p className="kicker">Parsed replays</p>
        <h2 id="report-objectives" className="text-lg font-semibold">
          Map objectives
        </h2>
        <SampleNote read={games} parsed={replays.parsedInPeriod} />
      </div>
      {games < MIN_REPLAY_GAMES ? (
        <p className="text-sm text-muted-foreground">
          Not enough parsed replays yet ({games} of {MIN_REPLAY_GAMES} needed).
        </p>
      ) : (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {rows.map((r) => (
            <div key={r.label}>
              <dt className="text-xs text-muted-foreground">{r.label}</dt>
              <dd className="text-lg font-semibold tabular-nums">
                {per(r.total)}
                <span className="text-xs font-normal text-muted-foreground"> /game</span>
              </dd>
              <dd className="text-xs text-muted-foreground tabular-nums">{r.total} total</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
