import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, ChevronRight, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { getCurrentUser } from "@/modules/identity";
import { getHeroMap } from "@/modules/matches/composition";
import { HeroPortrait, heroName } from "@/modules/matches/ui/hero-portrait";
import { ensurePatchesFresh, getPatchQueries } from "@/modules/patches/composition";
import { changesAffectingPool } from "@/modules/patches/domain/patch";
import { parsePatchVersion } from "@/modules/patches/domain/patch-version";
import { getHeroPool } from "@/modules/patches/hero-pool";

export const metadata: Metadata = { title: "Patch notes" };

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

  await ensurePatchesFresh();
  const queries = await getPatchQueries();
  const [page, user, heroes] = await Promise.all([
    queries.list({ cursor, limit: 12 }),
    getCurrentUser({ tolerateErrors: true }),
    getHeroMap(),
  ]);

  const latest = !cursor ? page.items[0] : undefined;
  const latestPatch = latest ? await queries.getByVersion(latest.version) : null;
  const pool = user && latestPatch ? await getHeroPool(user, new Date()) : null;
  const yourChanges = pool && latestPatch ? changesAffectingPool(latestPatch, pool.heroIds) : [];

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Patch hub"
        title="Patch notes"
        description="Official Dota 2 patch notes in Valve's original wording, with the changes that matter to your heroes pulled to the top."
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
              <p className="kicker">Latest patch</p>
              <h2
                id="latest-patch"
                className="font-display text-5xl font-bold tracking-wide sm:text-6xl"
              >
                {latest.version}
              </h2>
              <p className="text-sm text-muted-foreground">
                Released {formatDate(latest.publishedAt)} · {latest.summary.heroesChanged} heroes
                and {latest.summary.itemsChanged + latest.summary.neutralItemsChanged} items changed
              </p>
            </div>
            <Link
              href={`/patches/${latest.version}`}
              className="inline-flex items-center gap-2 self-start rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[0_0_30px_-8px_oklch(0.8_0.13_80/0.6)] transition-transform hover:-translate-y-0.5 lg:self-auto"
            >
              Read patch {latest.version} <ArrowRight className="size-4" />
            </Link>
          </div>

          {user && (
            <div className="relative mt-6 border-t border-white/[0.06] pt-5">
              <h3 className="mb-3 text-sm font-semibold">
                {yourChanges.length > 0
                  ? `${yourChanges.length} of your heroes changed`
                  : "None of your recent heroes changed in this patch"}
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
                  &ldquo;Your heroes&rdquo; means heroes with 3+ ranked games in the last 90 days,
                  plus any you star on a patch page.
                </p>
              )}
            </div>
          )}
        </section>
      )}

      {page.items.length === 0 ? (
        <section className="panel grid place-items-center gap-3 px-6 py-16 text-center">
          <AlertTriangle aria-hidden className="size-8 text-gold" />
          <h2 className="text-lg font-semibold">Patch notes aren&apos;t available right now</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            We couldn&apos;t reach Valve&apos;s patch feed. You can read them on the official site
            in the meantime.
          </p>
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
            {cursor ? "Older patches" : "All patches"}
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
                        {p.parseStatus === "partial" ? "Partly imported" : "Link only"}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">{formatDate(p.publishedAt)}</span>
                  <span className="mt-auto flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      <span className="font-semibold text-foreground">
                        {p.summary.heroesChanged}
                      </span>{" "}
                      heroes
                    </span>
                    <span>
                      <span className="font-semibold text-foreground">
                        {p.summary.itemsChanged + p.summary.neutralItemsChanged}
                      </span>{" "}
                      items
                    </span>
                    {p.summary.generalNotes > 0 && (
                      <span>
                        <span className="font-semibold text-foreground">
                          {p.summary.generalNotes}
                        </span>{" "}
                        general
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
                Back to latest
              </Link>
            ) : (
              <span />
            )}
            {page.nextCursor && (
              <Link
                href={`/patches?cursor=${page.nextCursor}`}
                className="inline-flex items-center gap-1 font-medium text-gold hover:underline"
              >
                Older patches <ChevronRight className="size-4" />
              </Link>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
