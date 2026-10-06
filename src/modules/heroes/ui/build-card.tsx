import { getT } from "@/common/i18n/server";
import type { ItemInfo } from "@/modules/matches/domain/read-models";
import { ItemIcon } from "@/modules/matches/ui/item-icon";
import { MetaSection } from "@/modules/meta/ui/meta-section";
import type { BuildRow } from "../domain/build-vs-pros";

/** The pros' core items on the hero, with how often you buy each. */
export async function BuildCard({
  rows,
  items,
  heroLabel,
  yourGames,
}: {
  rows: BuildRow[];
  items: Map<number, ItemInfo>;
  heroLabel: string;
  yourGames: number;
}) {
  const t = await getT();
  return (
    <MetaSection
      id="build-vs-pros"
      kicker={t("heroes.build.kicker")}
      title={t("heroes.build.title")}
      description={t("heroes.build.description", { hero: heroLabel, games: yourGames })}
      footer={t("heroes.build.footer")}
    >
      <ul className="divide-y divide-white/[0.05] border-t border-white/[0.06]">
        {rows.map((r) => {
          const pct = Math.round(r.yourShare * 100);
          return (
            <li key={r.itemId} className="flex items-center gap-3 px-5 py-2.5">
              <ItemIcon itemId={r.itemId} items={items} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{items.get(r.itemId)?.name ?? r.key}</span>
                <span className="block text-xs text-muted-foreground">
                  {t(r.phase === "mid" ? "heroes.build.proRankMid" : "heroes.build.proRankLate", {
                    rank: r.rank,
                  })}
                </span>
              </span>
              <span className="w-24 shrink-0">
                <span className="block h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <span
                    className={r.rarely ? "block h-full bg-loss/70" : "block h-full bg-win/70"}
                    style={{ width: `${Math.max(pct, 2)}%` }}
                  />
                </span>
                <span className="mt-0.5 block text-right text-xs tabular-nums">
                  {t("heroes.build.you", { pct })}
                  {r.rarely && <span className="text-loss"> · {t("heroes.build.rarely")}</span>}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </MetaSection>
  );
}
