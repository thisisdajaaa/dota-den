import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, BookOpenText, Radio, Swords, Users, type LucideIcon } from "lucide-react";
import { redirect } from "next/navigation";
import { SteamIcon } from "@/components/icons/steam-icon";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { matchesService } from "@/modules/matches";
import { formatAgo } from "@/modules/matches/ui/format";
import { HeroPortrait, heroName } from "@/modules/matches/ui/hero-portrait";
import { getCurrentUser } from "@/modules/identity";
import { metaService } from "@/modules/meta";
import { heroPatchChanges } from "@/modules/meta/domain/patch-tips";
import { MetaOverviewCompact } from "@/modules/meta/ui/meta-overview";
import { patchesService } from "@/modules/patches";
import { PlayerSearchForm } from "@/modules/players/ui/player-search-form";
import { getT } from "@/common/i18n/server";
import { plural } from "@/common/i18n/translate";
import { logger } from "@/common/logging/logger";

const AUTH_ERRORS = ["state_mismatch", "provider_unavailable"] as const;

/** A well-known public pro profile (Yatoro), so visitors can see a full profile before signing in. */
const EXAMPLE_PROFILE_ACCOUNT_ID = 321580662;

const SIGN_IN_HREF = "/api/v1/auth/steam/login";

const FEATURES: ReadonlyArray<{
  icon: LucideIcon;
  key: "party" | "draft" | "guides" | "live";
  href: string;
}> = [
  { icon: Users, key: "party", href: SIGN_IN_HREF },
  { icon: Swords, key: "draft", href: "/draft" },
  { icon: BookOpenText, key: "guides", href: "/guides" },
  { icon: Radio, key: "live", href: "/live" },
];

/** How many of the most-changed heroes the patch card lists. */
const TOP_CHANGES = 3;

/**
 * The newest official patch, straight from the patch hub (real data, never a mock): the
 * heroes it touched and the first line of each of the most-changed heroes' notes.
 */
async function LatestPatchCard() {
  const t = await getT();
  await patchesService.ensureFresh();
  const [latest, heroes] = await Promise.all([
    patchesService.latest().catch(() => null),
    matchesService.heroMap(),
  ]);
  if (!latest) return null;
  const patch = await patchesService.getByVersion(latest.version).catch(() => null);
  const portraits = (patch?.sections.heroes ?? []).slice(0, 12);
  const changes = patch
    ? [...heroPatchChanges(patch).values()]
        .filter((c) => c.lines.length > 0)
        // Most notes first; patch order breaks ties.
        .map((c, i) => ({ ...c, i }))
        .sort((a, b) => b.lines.length - a.lines.length || a.i - b.i)
        .slice(0, TOP_CHANGES)
    : [];
  const patchHref = `/patches/${encodeURIComponent(latest.version)}`;

  return (
    <article
      aria-labelledby="latest-patch"
      className="panel relative grid grid-cols-1 gap-8 overflow-hidden p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -left-16 size-72 rounded-full bg-gold/10 blur-3xl"
      />
      <div className="flex flex-col gap-4">
        <div>
          <p className="kicker">{t("home.patch.kicker")}</p>
          <h2 id="latest-patch" className="mt-1 font-display text-5xl font-bold tracking-wide">
            {latest.version}
          </h2>
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
        </div>
        {portraits.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label={t("home.patch.heroesAria")}>
            {portraits.map((h) => (
              <li key={h.heroId} title={heroName(heroes.get(h.heroId), h.heroId)}>
                <HeroPortrait hero={heroes.get(h.heroId)} heroId={h.heroId} size="sm" />
              </li>
            ))}
          </ul>
        )}
        <div className="mt-auto flex flex-wrap gap-2 pt-2">
          <Button asChild>
            <Link href={patchHref} aria-label={t("home.patch.aria", { version: latest.version })}>
              {t("home.patch.read")} <ArrowRight aria-hidden className="size-4" />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/meta">{t("home.patch.metaCta")}</Link>
          </Button>
        </div>
      </div>
      <div className="min-w-0">
        <h3 className="kicker mb-3">{t("home.patch.topChanges")}</h3>
        {changes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("home.patch.noHeroChanges")}</p>
        ) : (
          <ul className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.06] bg-black/20">
            {changes.map((c) => {
              const hero = heroes.get(c.heroId);
              return (
                <li key={c.heroId}>
                  <Link
                    href={`${patchHref}#hero-${c.heroId}`}
                    className="group flex gap-3 p-3 transition-colors hover:bg-white/[0.03] sm:p-4"
                  >
                    <HeroPortrait hero={hero} heroId={c.heroId} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium group-hover:text-gold">
                        {heroName(hero, c.heroId)}
                      </p>
                      {/* Valve's wording, never rewritten. */}
                      <p className="line-clamp-2 text-sm text-muted-foreground">{c.lines[0]}</p>
                      {c.lines.length > 1 && (
                        <p className="mt-0.5 text-xs text-gold/80">
                          {plural(t, "home.patch.more", c.lines.length - 1)}
                        </p>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </article>
  );
}

/** Rows the preview shows: 3 pools of 3 heroes. Fixed so the skeleton matches exactly. */
const PREVIEW_POOLS = 3;
const PREVIEW_ROWS = 3;

/**
 * The real product in the hero: a framed Meta page with today's numbers (cached hero stats,
 * one upstream call shared with the Meta page). Nothing here is mocked.
 */
async function MetaPreviewBody() {
  const t = await getT();
  const [res, catalog] = await Promise.all([
    metaService.overview(PREVIEW_ROWS).catch((e: unknown) => {
      logger.warn("home_meta_preview_failed", { error: e });
      return null;
    }),
    matchesService.heroMap().catch(() => new Map()),
  ]);
  if (!res?.ok)
    return (
      <p className="grid min-h-[29rem] place-items-center px-6 text-center text-sm text-muted-foreground">
        {t("home.preview.unavailable")}
      </p>
    );
  return (
    <>
      <MetaOverviewCompact view={res.value} catalog={catalog} className="min-h-[29rem]" />
      <p className="mt-4 truncate text-[0.7rem] text-muted-foreground">
        {t("home.preview.source", { ago: formatAgo(res.value.fetchedAt, new Date()) })}
      </p>
    </>
  );
}

function MetaPreviewSkeleton({ label }: { label: string }) {
  return (
    <div aria-busy aria-label={label}>
      <div className="min-h-[29rem] space-y-4">
        {Array.from({ length: PREVIEW_POOLS }, (_, i) => (
          <div key={i}>
            <Skeleton className="mb-2 h-4 w-32" />
            <div className="space-y-1.5">
              {Array.from({ length: PREVIEW_ROWS }, (_, j) => (
                <div key={j} className="flex h-9 items-center gap-3">
                  <span className="w-3" />
                  <Skeleton className="h-8 w-[3.56rem] rounded-md" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-28" />
                    <Skeleton className="h-2.5 w-36" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <Skeleton className="mt-4 h-3 w-48" />
    </div>
  );
}

async function MetaPreview() {
  const t = await getT();
  return (
    <figure aria-label={t("home.preview.label")} className="relative w-full max-w-md">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-6 -z-10 rounded-[2rem] bg-gold/[0.07] blur-2xl"
      />
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-card/90 shadow-[0_30px_80px_-30px_rgb(0_0_0/0.9)] ring-1 ring-gold/10">
        <div
          aria-hidden
          className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2.5"
        >
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="ml-2 flex-1 truncate rounded-md bg-white/[0.04] px-3 py-1 text-center text-[0.7rem] text-muted-foreground">
            {t("home.preview.address")}
          </span>
        </div>
        <div className="p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="kicker">{t("home.preview.kicker")}</p>
              <p className="font-display text-xl font-bold tracking-wide">
                {t("home.preview.title")}
              </p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-win/10 px-2 py-0.5 text-[0.65rem] font-semibold text-win">
              <span aria-hidden className="size-1.5 rounded-full bg-win" />
              {t("home.preview.live")}
            </span>
          </div>
          <Suspense fallback={<MetaPreviewSkeleton label={t("home.preview.loading")} />}>
            <MetaPreviewBody />
          </Suspense>
        </div>
        <Link
          href="/meta"
          className="flex items-center justify-between border-t border-white/[0.06] px-5 py-3 text-sm font-medium text-gold transition-colors hover:bg-white/[0.03]"
        >
          {t("home.preview.open")}
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
    </figure>
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

      <section className="relative grid grid-cols-1 items-center gap-12 overflow-x-clip pt-6 lg:grid-cols-[1.15fr_1fr] lg:overflow-x-visible">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 left-1/2 -z-10 size-[22rem] -translate-x-1/2 rounded-full bg-gold/10 blur-[100px] sm:size-[36rem] sm:blur-[120px] lg:left-1/4 lg:translate-x-0"
        />
        <div className="min-w-0 space-y-6">
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
              <a href={SIGN_IN_HREF}>
                <SteamIcon className="size-4" />
                {t("home.hero.signIn")}
              </a>
            </Button>
            <span className="text-xs text-muted-foreground">{t("home.hero.privacy")}</span>
          </div>
          <div className="max-w-xl space-y-3 border-t border-white/[0.06] pt-6">
            <PlayerSearchForm variant="inline" label={t("home.hero.lookupLabel")} />
            <Link
              href={`/players/${EXAMPLE_PROFILE_ACCOUNT_ID}`}
              className="group inline-flex flex-wrap items-center gap-x-1.5 text-sm font-medium text-gold"
            >
              <span className="group-hover:underline">{t("home.hero.example")}</span>
              <span className="font-normal text-muted-foreground">
                ({t("home.hero.exampleWho")})
              </span>
              <ArrowRight
                aria-hidden
                className="size-4 transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          </div>
        </div>
        <div className="flex min-w-0 justify-center lg:justify-end">
          <MetaPreview />
        </div>
      </section>

      {/* Same height as the card's usual content, so nothing below jumps. */}
      <Suspense fallback={<Skeleton className="h-[22rem] w-full rounded-2xl lg:h-[19rem]" />}>
        <LatestPatchCard />
      </Suspense>

      <section aria-labelledby="features" className="space-y-6">
        <div>
          <p className="kicker">{t("home.features.kicker")}</p>
          <h2 id="features" className="text-2xl font-semibold">
            {t("home.features.title")}
          </h2>
        </div>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => {
            const body = (
              <>
                <span className="mb-4 grid size-10 place-items-center rounded-lg bg-gold/10 text-gold ring-1 ring-gold/25">
                  <f.icon aria-hidden className="size-5" />
                </span>
                <h3 className="font-semibold">{t(`home.features.${f.key}.title`)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {t(`home.features.${f.key}.body`)}
                </p>
                <span className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-medium text-gold">
                  {t(`home.features.${f.key}.cta`)}
                  <ArrowRight
                    aria-hidden
                    className="size-4 transition-transform group-hover:translate-x-0.5"
                  />
                </span>
              </>
            );
            const className =
              "panel group flex h-full flex-col p-6 transition-[transform,border-color] hover:-translate-y-1 hover:border-gold/30";
            return (
              <li key={f.key}>
                {/* Sign-in is an API route, so it's a plain link (no client navigation). */}
                {f.href.startsWith("/api/") ? (
                  <a href={f.href} className={className}>
                    {body}
                  </a>
                ) : (
                  <Link href={f.href} className={className}>
                    {body}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
