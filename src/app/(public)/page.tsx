import Link from "next/link";
import { Suspense } from "react";
import {
  ArrowRight,
  BookOpenText,
  ChartNoAxesColumn,
  FlaskConical,
  Swords,
  Users,
} from "lucide-react";
import { redirect } from "next/navigation";
import { SteamIcon } from "@/components/icons/steam-icon";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { matchesService } from "@/modules/matches";
import { HeroPortrait, heroName } from "@/modules/matches/ui/hero-portrait";
import { getCurrentUser } from "@/modules/identity";
import { patchesService } from "@/modules/patches";
import { getT } from "@/common/i18n/server";

const AUTH_ERRORS = ["state_mismatch", "provider_unavailable"] as const;

const LOOP = [
  { icon: BookOpenText, key: "patch" },
  { icon: Swords, key: "draft" },
  { icon: ChartNoAxesColumn, key: "review" },
  { icon: FlaskConical, key: "experiment" },
] as const;

const FEATURES = [
  { icon: Users, key: "party" },
  { icon: BookOpenText, key: "patches" },
  { icon: Swords, key: "draft" },
] as const;

/** The newest official patch, straight from the patch hub (real data, never a mock). */
async function LatestPatchCard() {
  const t = await getT();
  await patchesService.ensureFresh();
  const [latest, heroes] = await Promise.all([
    patchesService.latest().catch(() => null),
    matchesService.heroMap(),
  ]);
  if (!latest) return null;
  const patch = await patchesService.getByVersion(latest.version).catch(() => null);
  const changed = (patch?.sections.heroes ?? []).slice(0, 10);

  return (
    <Link
      href={`/patches/${latest.version}`}
      className="panel group relative block w-full max-w-md p-6 transition-[transform,border-color] hover:-translate-y-1 hover:border-gold/30"
      aria-label={t("home.patch.aria", { version: latest.version })}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 -right-10 size-56 rounded-full bg-gold/10 blur-3xl"
      />
      <p className="kicker">{t("home.patch.kicker")}</p>
      <p className="mt-1 font-display text-5xl font-bold tracking-wide">{latest.version}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(
          latest.publishedAt,
        )}{" "}
        ·{" "}
        {t("home.patch.changed", {
          heroes: latest.summary.heroesChanged,
          items: latest.summary.itemsChanged + latest.summary.neutralItemsChanged,
        })}
      </p>
      {changed.length > 0 && (
        <ul className="mt-5 flex flex-wrap gap-1.5" aria-label={t("home.patch.heroesAria")}>
          {changed.map((h) => (
            <li key={h.heroId} title={heroName(heroes.get(h.heroId), h.heroId)}>
              <HeroPortrait hero={heroes.get(h.heroId)} heroId={h.heroId} size="sm" />
            </li>
          ))}
        </ul>
      )}
      <span className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-gold">
        {t("home.patch.read")}{" "}
        <ArrowRight
          aria-hidden
          className="size-4 transition-transform group-hover:translate-x-0.5"
        />
      </span>
    </Link>
  );
}

export default async function LandingPage({ searchParams }: PageProps<"/">) {
  if (await getCurrentUser({ tolerateErrors: true })) redirect("/dashboard");
  const { auth_error, bye, deleted } = await searchParams;
  const signedOut = bye === "1";
  const authError = typeof auth_error === "string" ? auth_error : null;
  const signInRequired = authError === "signed_out";
  const t = await getT();
  const authErrorText = (AUTH_ERRORS as readonly string[]).includes(authError ?? "")
    ? t(`home.authErrors.${authError as (typeof AUTH_ERRORS)[number]}`)
    : t("home.authErrors.fallback");

  return (
    <div className="space-y-20">
      {deleted === "1" && (
        <Alert>
          <AlertTitle>{t("home.alerts.deletedTitle")}</AlertTitle>
          <AlertDescription>{t("home.alerts.deletedBody")}</AlertDescription>
        </Alert>
      )}
      {signedOut && (
        <Alert>
          <AlertTitle>{t("home.alerts.signedOutTitle")}</AlertTitle>
          <AlertDescription>
            <p>
              {t("home.alerts.signedOutBefore")}
              <a
                href="https://steamcommunity.com/"
                target="_blank"
                rel="noreferrer"
                className="text-gold underline-offset-2 hover:underline"
              >
                {t("home.alerts.signedOutLink")}
              </a>
              {t("home.alerts.signedOutMiddle")}
              <strong>{t("home.alerts.signedOutSteamButton")}</strong>
              {t("home.alerts.signedOutAfter")}
            </p>
          </AlertDescription>
        </Alert>
      )}
      {signInRequired && (
        <Alert>
          <AlertTitle>{t("home.alerts.signInRequiredTitle")}</AlertTitle>
          <AlertDescription>{t("home.alerts.signInRequiredBody")}</AlertDescription>
        </Alert>
      )}
      {authError && !signInRequired && (
        <Alert variant="destructive">
          <AlertTitle>{t("home.alerts.signInFailedTitle")}</AlertTitle>
          <AlertDescription>{authErrorText}</AlertDescription>
        </Alert>
      )}

      <section className="relative grid grid-cols-1 items-center gap-12 pt-6 lg:grid-cols-[1.2fr_1fr]">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 left-1/4 -z-10 size-[36rem] rounded-full bg-gold/10 blur-[120px]"
        />
        <div className="space-y-6">
          <p className="kicker">{t("home.hero.kicker")}</p>
          <h1 className="font-display text-4xl leading-[1.1] font-bold tracking-wide sm:text-5xl lg:text-6xl">
            {t("home.hero.titleBefore")}
            <span className="bg-gradient-to-r from-gold to-[oklch(0.75_0.17_50)] bg-clip-text text-transparent">
              {t("home.hero.titleHighlight")}
            </span>
            {t("home.hero.titleAfter")}
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground">{t("home.hero.body")}</p>
          <div className="flex flex-wrap items-center gap-4">
            <Button
              asChild
              size="lg"
              className="gap-2 shadow-[0_0_30px_-6px_oklch(0.8_0.13_80/0.6)]"
            >
              <a href="/api/v1/auth/steam/login">
                <SteamIcon className="size-4" />
                {t("home.hero.signIn")}
              </a>
            </Button>
            <span className="text-xs text-muted-foreground">{t("home.hero.privacy")}</span>
          </div>
        </div>
        <div className="flex justify-center lg:justify-end">
          <Suspense fallback={<Skeleton className="h-64 w-full max-w-md rounded-2xl" />}>
            <LatestPatchCard />
          </Suspense>
        </div>
      </section>

      <section aria-labelledby="loop" className="space-y-6">
        <div>
          <p className="kicker">{t("home.loop.kicker")}</p>
          <h2 id="loop" className="text-2xl font-semibold">
            {t("home.loop.title")}
          </h2>
        </div>
        <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {LOOP.map((step, i) => (
            <li key={step.key} className="panel p-5">
              <div className="mb-4 flex items-center justify-between">
                <span className="grid size-10 place-items-center rounded-lg bg-gold/10 text-gold ring-1 ring-gold/25">
                  <step.icon aria-hidden className="size-5" />
                </span>
                <span className="font-display text-2xl font-bold text-white/10">{i + 1}</span>
              </div>
              <h3 className="font-semibold">{t(`home.loop.${step.key}.title`)}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {t(`home.loop.${step.key}.body`)}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="features" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <h2 id="features" className="sr-only">
          {t("home.features.title")}
        </h2>
        {FEATURES.map((f) => (
          <article key={f.key} className="panel p-6">
            <f.icon aria-hidden className="mb-4 size-6 text-gold" />
            <h3 className="font-semibold">{t(`home.features.${f.key}.title`)}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {t(`home.features.${f.key}.body`)}
            </p>
          </article>
        ))}
      </section>
    </div>
  );
}
