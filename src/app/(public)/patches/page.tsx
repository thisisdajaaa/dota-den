import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, ChevronRight, ExternalLink } from "lucide-react";
import { getT } from "@/common/i18n/server";
import { PageHeader } from "@/components/page-header";
import { getCurrentUser } from "@/modules/identity";
import { matchesService } from "@/modules/matches";
import { HeroPortrait, heroName } from "@/modules/matches/ui/hero-portrait";
import { changesAffectingPool } from "@/modules/patches/domain/patch";
import { parsePatchVersion } from "@/modules/patches/domain/patch-version";
import { patchesService } from "@/modules/patches";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("patches.title") };
}

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

export default async function PatchesPage({ searchParams }: PageProps<"/patches">) {
  const { cursor: raw } = await searchParams;
  const cursor = typeof raw === "string" && parsePatchVersion(raw).ok ? raw : null;
  const t = await getT();

  await patchesService.ensureFresh();
  const queries = patchesService;
  const [page, user, heroes] = await Promise.all([
    queries.list({ cursor, limit: 12 }),
    getCurrentUser({ tolerateErrors: true }),
    matchesService.heroMap(),
  ]);

  const latest = !cursor ? page.items[0] : undefined;
  const latestPatch = latest ? await queries.getByVersion(latest.version) : null;
  const pool = user && latestPatch ? await patchesService.heroPool(user, new Date()) : null;
  const yourChanges = pool && latestPatch ? changesAffectingPool(latestPatch, pool.heroIds) : [];

  return (
    <div className="space-y-8">
      <PageHeader
        kicker={t("patches.kicker")}
        title={t("patches.title")}
        description={t("patches.description")}
      />

      {latest && latestPatch && (
        <section
          className="panel relative overflow-hidden p-6 sm:p-8"
          aria-labelledby="latest-patch"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -top-20 -right-10 size-80 rounded-full bg-gold/10 blur-3xl"
          />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <p className="kicker">{t("patches.latest.kicker")}</p>
              <h2
                id="latest-patch"
                className="font-display text-5xl font-bold tracking-wide sm:text-6xl"
              >
                {latest.version}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t("patches.latest.released", {
                  date: formatDate(latest.publishedAt),
                  heroes: latest.summary.heroesChanged,
                  items: latest.summary.itemsChanged + latest.summary.neutralItemsChanged,
                })}
              </p>
            </div>
            <Link
              href={`/patches/${latest.version}`}
              className="inline-flex items-center gap-2 self-start rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[0_0_30px_-8px_oklch(0.8_0.13_80/0.6)] transition-transform hover:-translate-y-0.5 lg:self-auto"
            >
              {t("patches.latest.read", { version: latest.version })}{" "}
              <ArrowRight className="size-4" />
            </Link>
          </div>

          {user && (
            <div className="relative mt-6 border-t border-white/[0.06] pt-5">
              <h3 className="mb-3 text-sm font-semibold">
                {yourChanges.length > 0
                  ? t("patches.latest.yoursChanged", { count: yourChanges.length })
                  : t("patches.latest.noneChanged")}
              </h3>
              {yourChanges.length > 0 ? (
                <ul className="flex flex-wrap gap-2">
                  {yourChanges.map((c) => {
                    const hero = heroes.get(c.heroId);
                    return (
                      <li key={c.heroId}>
                        <Link
                          href={`/patches/${latest.version}#hero-${c.heroId}`}
                          className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-card/70 py-1 pr-3 pl-1 text-sm transition-colors hover:border-gold/40"
                        >
                          <HeroPortrait hero={hero} heroId={c.heroId} size="xs" />
                          {heroName(hero, c.heroId)}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {t("patches.latest.yourHeroesHelp")}
                </p>
              )}
            </div>
          )}
        </section>
      )}

      {page.items.length === 0 ? (
        <section className="panel grid place-items-center gap-3 px-6 py-16 text-center">
          <AlertTriangle aria-hidden className="size-8 text-gold" />
          <h2 className="text-lg font-semibold">{t("patches.unavailable.title")}</h2>
          <p className="max-w-md text-sm text-muted-foreground">{t("patches.unavailable.body")}</p>
          <a
            href="https://www.dota2.com/patches"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm text-gold hover:underline"
          >
            dota2.com/patches <ExternalLink className="size-3.5" />
          </a>
        </section>
      ) : (
        <section aria-labelledby="all-patches" className="space-y-4">
          <h2 id="all-patches" className="text-lg font-semibold">
            {cursor ? t("patches.list.older") : t("patches.list.all")}
          </h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {page.items.map((p) => (
              <li key={p.version}>
                <Link
                  href={`/patches/${p.version}`}
                  className="panel group flex h-full flex-col gap-3 p-5 transition-[transform,border-color] hover:-translate-y-0.5 hover:border-gold/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-display text-3xl font-bold tracking-wide">
                      {p.version}
                    </span>
                    {p.parseStatus !== "parsed" && (
                      <span className="rounded border border-gold/30 bg-gold/10 px-1.5 py-0.5 text-[0.65rem] font-semibold text-gold">
                        {p.parseStatus === "partial"
                          ? t("patches.list.partial")
                          : t("patches.list.linkOnly")}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">{formatDate(p.publishedAt)}</span>
                  <span className="mt-auto flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      <span className="font-semibold text-foreground">
                        {p.summary.heroesChanged}
                      </span>{" "}
                      {t("patches.list.heroes")}
                    </span>
                    <span>
                      <span className="font-semibold text-foreground">
                        {p.summary.itemsChanged + p.summary.neutralItemsChanged}
                      </span>{" "}
                      {t("patches.list.items")}
                    </span>
                    {p.summary.generalNotes > 0 && (
                      <span>
                        <span className="font-semibold text-foreground">
                          {p.summary.generalNotes}
                        </span>{" "}
                        {t("patches.list.general")}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="flex justify-between text-sm">
            {cursor ? (
              <Link href="/patches" className="text-muted-foreground hover:text-foreground">
                {t("patches.list.backToLatest")}
              </Link>
            ) : (
              <span />
            )}
            {page.nextCursor && (
              <Link
                href={`/patches?cursor=${page.nextCursor}`}
                className="inline-flex items-center gap-1 font-medium text-gold hover:underline"
              >
                {t("patches.list.older")} <ChevronRight className="size-4" />
              </Link>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
