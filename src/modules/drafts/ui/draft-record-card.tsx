import { cn } from "cn";
import { getT } from "@/common/i18n/server";
import { plural } from "@/common/i18n/translate";
import type { DraftRecordView } from "../dtos/responses/draft-record.dto";

function pct(r: { games: number; wins: number }): string {
  return r.games ? `${Math.round((r.wins / r.games) * 100)}%` : "—";
}

/** Your recent ranked games, split by whether the draft favoured your side. */
export async function DraftRecordCard({ view }: { view: DraftRecordView }) {
  const t = await getT();
  const { record, total } = view;
  const rows = [
    {
      label: t("drafts.record.favoured"),
      hint: t("drafts.record.favouredHint"),
      r: record.favoured,
      tone: "text-win",
    },
    {
      label: t("drafts.record.close"),
      hint: t("drafts.record.closeHint"),
      r: record.even,
      tone: "",
    },
    {
      label: t("drafts.record.against"),
      hint: t("drafts.record.againstHint"),
      r: record.against,
      tone: "text-loss",
    },
  ];
  return (
    <section className="panel space-y-3 p-5" aria-labelledby="draft-record-title">
      <div>
        <p className="kicker">{t("drafts.record.kicker")}</p>
        <h2 id="draft-record-title" className="text-lg font-semibold">
          {t("drafts.record.title")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("drafts.record.intro", {
            total,
            graded:
              record.graded < total ? t("drafts.record.graded", { graded: record.graded }) : "",
          })}
        </p>
      </div>
      {/* Three across on phones too (it sits above the match list): compact cells, values
          pinned to the bottom so they line up when a label wraps. */}
      <ul className="grid grid-cols-3 gap-2 sm:gap-3">
        {rows.map((x) => (
          <li
            key={x.label}
            className="flex flex-col rounded-lg border border-white/[0.06] p-2.5 sm:p-3"
          >
            <p className="text-xs font-medium sm:text-sm">{x.label}</p>
            <p className="text-[0.65rem] text-muted-foreground sm:text-xs">{x.hint}</p>
            <p
              className={cn("mt-auto pt-1 text-xl font-semibold tabular-nums sm:text-2xl", x.tone)}
            >
              {x.r.games ? `${x.r.wins}–${x.r.games - x.r.wins}` : "—"}
            </p>
            <p className="text-[0.65rem] text-muted-foreground tabular-nums sm:text-xs">
              {x.r.games
                ? t("drafts.record.won", {
                    pct: pct(x.r),
                    games: plural(t, "common.count.games", x.r.games),
                  })
                : t("drafts.record.noGames")}
            </p>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        {record.favouredSideWon.games > 0 &&
          t("drafts.record.favouredWon", {
            pct: pct(record.favouredSideWon),
            games: record.favouredSideWon.games,
          })}
        {t("drafts.record.footnote", { pct: Math.round(view.accuracy * 100) })}
      </p>
    </section>
  );
}
