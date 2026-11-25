import { cn } from "cn";
import type { Messages } from "@/common/i18n/messages";
import type { Translator } from "@/common/i18n/translate";
import type { AdminOverviewDto } from "@/modules/admin";

/** Share of a cap at which a budget shows as nearly spent (matches the owner alert). */
export const BUDGET_WARN_SHARE = 0.8;

/** Today's use of each daily budget as a bar, plus whether Redis answered. */
export function BudgetsPanel({
  budgets,
  t,
}: {
  budgets: AdminOverviewDto["budgets"];
  t: Translator<Messages>;
}) {
  const redis = budgets?.redis ?? "error";
  return (
    <section aria-labelledby="admin-budgets" className="panel scroll-mt-20 space-y-4 p-5">
      <div>
        <h2 id="admin-budgets" className="text-lg font-semibold">
          {t("admin.budgets.title")}
        </h2>
        <p className="text-xs text-muted-foreground">{t("admin.budgets.body")}</p>
      </div>
      <p className={cn("text-sm", redis === "error" ? "text-loss" : "text-muted-foreground")}>
        {t(
          redis === "ok"
            ? "admin.budgets.redisOk"
            : redis === "off"
              ? "admin.budgets.redisOff"
              : "admin.budgets.redisError",
        )}
      </p>
      {budgets && budgets.budgets.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {budgets.budgets.map((b) => {
            const share = b.cap > 0 ? Math.min(1, b.used / b.cap) : 0;
            const tone = share >= 1 ? "bg-loss" : share >= BUDGET_WARN_SHARE ? "bg-gold" : "bg-win";
            return (
              <li key={b.key} className="space-y-1.5 rounded-lg border border-white/[0.06] p-3">
                <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                  <span>{t(`admin.budgets.names.${b.key}`)}</span>
                  <span className="font-medium tabular-nums">
                    {t("admin.budgets.usedOf", {
                      used: b.used.toLocaleString("en-US"),
                      cap: b.cap.toLocaleString("en-US"),
                    })}
                  </span>
                </p>
                <div
                  role="meter"
                  aria-label={t(`admin.budgets.names.${b.key}`)}
                  aria-valuemin={0}
                  aria-valuemax={b.cap}
                  aria-valuenow={Math.min(b.used, b.cap)}
                  className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]"
                >
                  <div
                    className={cn("h-full rounded-full", tone)}
                    style={{ width: `${Math.max(share * 100, b.used > 0 ? 2 : 0)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
