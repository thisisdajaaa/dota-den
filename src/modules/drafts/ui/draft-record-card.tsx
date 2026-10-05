import { cn } from "cn";
import type { DraftRecordView } from "../composition";

function pct(r: { games: number; wins: number }): string {
  return r.games ? `${Math.round((r.wins / r.games) * 100)}%` : "—";
}

/** Your recent ranked games, split by whether the draft favoured your side. */
export function DraftRecordCard({ view }: { view: DraftRecordView }) {
  const { record, total } = view;
  const rows = [
    {
      label: "Draft favoured you",
      hint: "53%+ for your side",
      r: record.favoured,
      tone: "text-win",
    },
    { label: "Too close to call", hint: "48–52%", r: record.even, tone: "" },
    { label: "Draft against you", hint: "47% or less", r: record.against, tone: "text-loss" },
  ];
  return (
    <section className="panel space-y-3 p-5" aria-labelledby="draft-record-title">
      <div>
        <p className="kicker">Your drafts</p>
        <h2 id="draft-record-title" className="text-lg font-semibold">
          Did the draft decide it?
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your last {total} ranked games, graded by the same draft outlook as the draft trainer
          {record.graded < total ? ` (${record.graded} graded so far; more each visit)` : ""}.
        </p>
      </div>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {rows.map((x) => (
          <li key={x.label} className="rounded-lg border border-white/[0.06] p-3">
            <p className="text-sm font-medium">{x.label}</p>
            <p className="text-xs text-muted-foreground">{x.hint}</p>
            <p className={cn("mt-1 text-2xl font-semibold tabular-nums", x.tone)}>
              {x.r.games ? `${x.r.wins}–${x.r.games - x.r.wins}` : "—"}
            </p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {x.r.games ? `${pct(x.r)} won · ${x.r.games} games` : "No games"}
            </p>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        {record.favouredSideWon.games > 0 &&
          `The favoured side won ${pct(record.favouredSideWon)} of these games (${record.favouredSideWon.games} with a favourite). `}
        The outlook picks the winner about {Math.round(view.accuracy * 100)}% of the time from the
        draft alone, so read this as a tendency, not a verdict on any one game.
      </p>
    </section>
  );
}
