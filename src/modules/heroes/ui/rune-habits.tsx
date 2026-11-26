import { getT } from "@/common/i18n/server";
import { StatTile } from "@/components/stat-tile";
import { MIN_RUNE_GAMES, type RuneHabits } from "../domain/rune-habits";

/** Your runes: tiles and the power runes you take, by kind. */
export async function RuneHabitsView({ runes }: { runes: RuneHabits }) {
  const t = await getT();
  const perGame = (n: number | null) => (n === null ? "—" : n.toFixed(1));
  const top = runes.powerByKind[0]?.n ?? 0;
  return (
    <section aria-labelledby="rune-habits" className="panel space-y-4 p-5">
      <div>
        <h2 id="rune-habits" className="text-lg font-semibold">
          {t("heroes.wards.runes.title")}
        </h2>
        <p className="text-xs text-muted-foreground">
          {t("heroes.wards.runes.description", { n: runes.games })}
        </p>
      </div>
      {runes.games === 0 ? (
        <p role="status" className="text-sm text-muted-foreground">
          {t("heroes.wards.runes.none")}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <StatTile
              label={t("heroes.wards.runes.tiles.bounty")}
              value={perGame(runes.perGame.bounty)}
              detail={t("heroes.wards.runes.tiles.bountyDetail")}
            />
            <StatTile
              label={t("heroes.wards.runes.tiles.horn")}
              value={
                runes.hornBountyShare === null ? "—" : `${Math.round(runes.hornBountyShare * 100)}%`
              }
              detail={
                runes.hornBountyShare === null
                  ? t("heroes.wards.runes.tiles.few", { min: MIN_RUNE_GAMES, n: runes.games })
                  : t("heroes.wards.runes.tiles.hornDetail")
              }
            />
            <StatTile
              label={t("heroes.wards.runes.tiles.power")}
              value={perGame(runes.perGame.power)}
              detail={t("heroes.wards.runes.tiles.powerDetail", {
                n: perGame(runes.powerLaningPerGame),
              })}
            />
            <StatTile
              label={t("heroes.wards.runes.tiles.wisdom")}
              value={perGame(runes.perGame.wisdom)}
              detail={t("heroes.wards.runes.tiles.wisdomDetail")}
            />
            <StatTile
              label={t("heroes.wards.runes.tiles.water")}
              value={perGame(runes.perGame.water)}
              detail={t("heroes.wards.runes.tiles.waterDetail")}
            />
          </div>
          {runes.powerByKind.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium">{t("heroes.wards.runes.byKind")}</h3>
              <ul className="max-w-xl space-y-1.5 text-sm">
                {runes.powerByKind.map((k) => (
                  <li key={k.kind} className="grid grid-cols-[8rem_1fr_2.5rem] items-center gap-3">
                    <span>{t(`heroes.wards.runes.kinds.${k.kind}`)}</span>
                    <span aria-hidden className="h-2 rounded-full bg-white/5">
                      <span
                        className="block h-2 rounded-full bg-gold/70"
                        style={{ width: `${Math.max(4, (k.n / top) * 100)}%` }}
                      />
                    </span>
                    <span className="text-right tabular-nums">{k.n}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
