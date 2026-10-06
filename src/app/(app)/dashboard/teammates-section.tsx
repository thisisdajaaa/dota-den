import Link from "next/link";
import { AlertTriangle, Users } from "lucide-react";
import { getT } from "@/common/i18n/server";
import type { Messages } from "@/common/i18n/messages";
import type { Translator } from "@/common/i18n/translate";
import { logger } from "@/common/logging/logger";
import { friendsService } from "@/modules/together";
import { TeammatesCard } from "@/modules/together/ui/teammates-card";
import { TeammatesSummary } from "@/modules/together/ui/teammates-summary";

function Heading({ t }: { t: Translator<Messages> }) {
  return (
    <div>
      <p className="kicker">{t("dashboard.teammates.kicker")}</p>
      <h2 className="text-lg font-semibold">{t("dashboard.teammates.title")}</h2>
    </div>
  );
}

/**
 * The overview's Teammates section. Streams behind Suspense; any failure blanks only this
 * section ("unavailable right now"), never the rest of the dashboard.
 */
export async function TeammatesSection({ user }: { user: { id: string; accountId32: number } }) {
  const t = await getT();
  let res: Awaited<ReturnType<typeof friendsService.teammatesOverview>> | null = null;
  try {
    res = await friendsService.teammatesOverview(user);
  } catch (e) {
    logger.error("teammates_section_failed", { error: e });
  }

  if (!res || !res.ok) {
    return (
      <section className="panel space-y-2 p-5" aria-label={t("dashboard.teammates.label")}>
        <Heading t={t} />
        <p role="alert" className="flex items-start gap-2 text-sm text-muted-foreground">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-loss" />
          {t("dashboard.teammates.unavailable")}
        </p>
      </section>
    );
  }

  const data = res.value;
  if (data.teammates.length === 0 && data.rivals.length === 0) {
    return (
      <section className="panel space-y-2 p-5" aria-label={t("dashboard.teammates.label")}>
        <Heading t={t} />
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <Users aria-hidden className="mt-0.5 size-4 shrink-0" />
          {t("dashboard.teammates.empty")}{" "}
          <Link href="/players" className="text-gold hover:underline">
            {t("dashboard.teammates.trackFriend")}
          </Link>
          {t("dashboard.teammates.emptyEnd")}
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-3" aria-label={t("dashboard.teammates.label")} role="region">
      <TeammatesSummary data={data} />
      <TeammatesCard
        rows={data.teammates.map((t) => ({
          ...t,
          lastPlayedAt: t.lastPlayedAt?.toISOString() ?? null,
        }))}
        now={new Date().toISOString()}
      />
    </div>
  );
}
