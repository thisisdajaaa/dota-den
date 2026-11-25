import type { Messages } from "@/common/i18n/messages";
import type { Translator } from "@/common/i18n/translate";
import type { AdminOverviewDto } from "@/modules/admin";

const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0);

/** Signed in → imported → came back → trial → subscribed, all time and for recent signups. */
export function FunnelPanel({
  funnel,
  t,
}: {
  funnel: AdminOverviewDto["funnel"];
  t: Translator<Messages>;
}) {
  const allBase = funnel[0]?.all ?? 0;
  const recentBase = funnel[0]?.recent ?? 0;
  const cell = (n: number | null, base: number) =>
    n === null ? (
      <span className="text-muted-foreground">–</span>
    ) : (
      <>
        {n}
        <span className="ml-1 text-xs text-muted-foreground">({pct(n, base)}%)</span>
      </>
    );
  return (
    <section aria-labelledby="admin-funnel" className="panel space-y-4 p-5">
      <div>
        <h2 id="admin-funnel" className="text-lg font-semibold">
          {t("admin.funnel.title")}
        </h2>
        <p className="text-xs text-muted-foreground">{t("admin.funnel.body")}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">{t("admin.funnel.title")}</caption>
          <thead>
            <tr className="text-left text-[0.65rem] tracking-wider text-muted-foreground uppercase">
              <th className="py-2 pr-4 font-medium">{t("admin.funnel.step")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("admin.funnel.all")}</th>
              <th className="py-2 pl-3 text-right font-medium">{t("admin.funnel.recent")}</th>
            </tr>
          </thead>
          <tbody>
            {funnel.map((row) => (
              <tr key={row.step} className="border-t border-white/[0.05]">
                <td className="py-2 pr-4">
                  <span className="block">{t(`admin.funnel.steps.${row.step}`)}</span>
                  {row.all !== null && allBase > 0 && (
                    <span aria-hidden className="mt-1 block h-1 rounded-full bg-white/[0.06]">
                      <span
                        className="block h-full rounded-full bg-gold/70"
                        style={{ width: `${Math.max(pct(row.all, allBase), row.all ? 2 : 0)}%` }}
                      />
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                  {cell(row.all, allBase)}
                </td>
                <td className="py-2 pl-3 text-right whitespace-nowrap tabular-nums">
                  {cell(row.recent, recentBase)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
