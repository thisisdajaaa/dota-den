import Link from "next/link";
import {
  CalendarRange,
  Check,
  ChevronRight,
  Circle,
  CircleAlert,
  Swords,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { cn } from "cn";
import { getT } from "@/common/i18n/server";
import { formatAgo } from "@/modules/matches/ui/format";

export type FirstRunStage = "first_sync" | "fetching" | "no_public_data";

type StepState = "done" | "current" | "warn" | "todo";

/**
 * A new player's import, as the steps we can actually see: signed in, history requested from
 * OpenDota (and when), games arriving. No percentages: we don't know how many games are coming.
 */
export async function FirstRunStatus({
  stage,
  requestedAt,
  lastSyncAt,
  now,
}: {
  stage: FirstRunStage;
  requestedAt: Date | null;
  lastSyncAt: Date | null;
  now: Date;
}) {
  const t = await getT();
  const steps: Array<{ key: string; state: StepState; title: string; detail?: string }> = [
    { key: "signedIn", state: "done", title: t("dashboard.firstRun.status.signedIn") },
    {
      key: "requested",
      state: requestedAt ? "done" : "current",
      title: t("dashboard.firstRun.status.requested"),
      detail: requestedAt
        ? t("dashboard.firstRun.status.requestedAgo", { ago: formatAgo(requestedAt, now) })
        : t("dashboard.firstRun.status.requestPending"),
    },
    {
      key: "arrive",
      state: !requestedAt ? "todo" : stage === "no_public_data" ? "warn" : "current",
      title: t("dashboard.firstRun.status.arrive"),
      detail: !requestedAt
        ? undefined
        : [
            stage === "no_public_data"
              ? t("dashboard.firstRun.status.arriveNone")
              : t("dashboard.firstRun.status.arriveWaiting"),
            lastSyncAt &&
              t("dashboard.firstRun.status.lastChecked", { ago: formatAgo(lastSyncAt, now) }),
          ]
            .filter(Boolean)
            .join(" · "),
    },
  ];
  const stateLabel = (s: StepState) =>
    s === "done"
      ? t("dashboard.firstRun.status.done")
      : s === "todo"
        ? t("dashboard.firstRun.status.todo")
        : t("dashboard.firstRun.status.current");

  return (
    <section className="panel space-y-4 p-5" aria-labelledby="first-run-title" aria-live="polite">
      <div className="space-y-1">
        <p className="kicker">{t("dashboard.firstRun.status.kicker")}</p>
        <h2 id="first-run-title" className="text-lg font-semibold">
          {t(`dashboard.empty.${stage}.title`)}
        </h2>
        <p className="text-sm text-muted-foreground">{t(`dashboard.empty.${stage}.body`)}</p>
      </div>
      <ol className="space-y-3" aria-label={t("dashboard.firstRun.status.stepsLabel")}>
        {steps.map((step) => (
          <li key={step.key} className="flex items-start gap-3 text-sm">
            <StepIcon state={step.state} />
            <div className={cn(step.state === "todo" && "text-muted-foreground")}>
              <span className="sr-only">{stateLabel(step.state)}</span>
              <span className="font-medium">{step.title}</span>
              {step.detail && (
                <p
                  className={cn(
                    "text-xs",
                    step.state === "warn" ? "text-gold" : "text-muted-foreground",
                  )}
                >
                  {step.detail}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function StepIcon({ state }: { state: StepState }) {
  if (state === "done") return <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-win" />;
  if (state === "warn")
    return <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-gold" />;
  if (state === "current")
    return (
      <span aria-hidden className="grid size-4 shrink-0 translate-y-0.5 place-items-center">
        <span className="size-2 animate-pulse rounded-full bg-gold" />
      </span>
    );
  return <Circle aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />;
}

/** Useful things that don't need imported games, so the first visit isn't just waiting. */
export async function WhileYouWait() {
  const t = await getT();
  const items: Array<{ key: "draft" | "meta" | "mmr"; href: string; icon: LucideIcon }> = [
    { key: "draft", href: "/draft", icon: Swords },
    { key: "meta", href: "/meta", icon: TrendingUp },
    { key: "mmr", href: "/mmr", icon: CalendarRange },
  ];
  return (
    <section className="panel space-y-3 p-5" aria-labelledby="while-you-wait">
      <div>
        <p className="kicker">{t("dashboard.firstRun.wait.kicker")}</p>
        <h2 id="while-you-wait" className="text-lg font-semibold">
          {t("dashboard.firstRun.wait.title")}
        </h2>
      </div>
      <ul className="space-y-2">
        {items.map(({ key, href, icon: Icon }) => (
          <li key={key}>
            <Link
              href={href}
              className="group flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 transition-colors hover:border-gold/30 hover:bg-gold/5"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gold/10 text-gold ring-1 ring-gold/30">
                <Icon aria-hidden className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium group-hover:text-gold">
                  {t(`dashboard.firstRun.wait.${key}.title`)}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {t(`dashboard.firstRun.wait.${key}.body`)}
                </span>
              </span>
              <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
