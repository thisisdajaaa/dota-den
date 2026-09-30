import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, ExternalLink } from "lucide-react";
import { getCurrentUser } from "@/modules/identity/composition";
import { getHeroMap, getMatchQueries } from "@/modules/matches/composition";
import { HeroPortrait, heroName } from "@/modules/matches/ui/hero-portrait";
import { getPatchImportService, getPatchQueries } from "@/modules/patches/composition";
import { changesAffectingPool, diffSummary } from "@/modules/patches/domain/patch";
import { parsePatchVersion } from "@/modules/patches/domain/patch-version";
import { HeroChangeCard, type HeroCohort } from "@/modules/patches/ui/hero-change-card";
import { ItemChangeList } from "@/modules/patches/ui/item-change-list";
import { NoteList } from "@/modules/patches/ui/note-list";
import { getHeroPool } from "@/modules/patches/hero-pool";
import { WatchButton } from "@/modules/patches/ui/watch-button";

const COHORT_WINDOW_MS = 30 * 86_400_000;

export async function generateMetadata({
  params,
}: PageProps<"/patches/[version]">): Promise<Metadata> {
  const { version } = await params;
  return { title: `Patch ${version}` };
}

export default async function PatchPage({ params }: PageProps<"/patches/[version]">) {
  const { version: raw } = await params;
  const version = decodeURIComponent(raw);
  if (!parsePatchVersion(version).ok) notFound();

  const queries = await getPatchQueries();
  let patch = await queries.getByVersion(version);
  if (!patch) {
    // Older patches are imported the first time someone opens them.
    const outcome = await (await getPatchImportService()).importVersion(version);
    if (outcome.outcome === "failed" && outcome.parseStatus === null) notFound();
    patch = await queries.getByVersion(version);
    if (!patch) notFound();
  }

  const [heroes, user] = await Promise.all([
    getHeroMap(),
    getCurrentUser({ tolerateErrors: true }),
  ]);
  const now = new Date();
  const pool = user ? await getHeroPool(user, now) : null;
  const yours = pool ? changesAffectingPool(patch, pool.heroIds) : [];

  // Before/after cohorts by date (match data only knows major patch labels).
  const cohorts = new Map<number, HeroCohort>();
  if (user && yours.length > 0) {
    const released = patch.publishedAt.getTime();
    const results = await (
      await getMatchQueries()
    ).rankedResults(user.accountId32, {
      from: new Date(released - COHORT_WINDOW_MS),
      to: new Date(Math.min(now.getTime(), released + COHORT_WINDOW_MS)),
    });
    for (const h of yours) {
      const c: HeroCohort = { before: { games: 0, wins: 0 }, after: { games: 0, wins: 0 } };
      for (const m of results) {
        if (m.heroId !== h.heroId) continue;
        const side = m.startedAt.getTime() < released ? c.before : c.after;
        side.games++;
        if (m.result === "win") side.wins++;
      }
      cohorts.set(h.heroId, c);
    }
  }

  const s = patch.sections;
  const summary = diffSummary(patch);
  const sortedHeroes = [...s.heroes].sort((a, b) =>
    heroName(heroes.get(a.heroId), a.heroId).localeCompare(
      heroName(heroes.get(b.heroId), b.heroId),
    ),
  );
  const watch = (heroId: number) =>
    pool ? (
      <WatchButton
        heroId={heroId}
        heroName={heroName(heroes.get(heroId), heroId)}
        watchedHeroIds={pool.watchlist.heroIds}
        itemIds={pool.watchlist.itemIds}
      />
    ) : null;

  const nav = [
    yours.length > 0 && { id: "your-heroes", label: `Your heroes (${yours.length})` },
    s.general.length > 0 && { id: "general", label: "General" },
    s.heroes.length > 0 && { id: "heroes", label: `Heroes (${summary.heroesChanged})` },
    s.items.length > 0 && { id: "items", label: `Items (${summary.itemsChanged})` },
    s.neutralItems.length > 0 && {
      id: "neutral-items",
      label: `Neutral items (${summary.neutralItemsChanged})`,
    },
    s.neutralCreeps.length > 0 && { id: "creeps", label: "Creeps" },
  ].filter((x): x is { id: string; label: string } => Boolean(x));

  return (
    <div className="space-y-8">
      <Link
        href="/patches"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden className="size-4" /> All patches
      </Link>

      <header className="panel relative overflow-hidden p-6 sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/3 size-96 rounded-full bg-gold/10 blur-3xl"
        />
        <div className="relative space-y-3">
          <p className="kicker">Gameplay update</p>
          <h1 className="font-display text-5xl font-bold tracking-wide sm:text-6xl">
            {patch.version}
          </h1>
          <p className="text-sm text-muted-foreground">
            Released{" "}
            {new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(
              patch.publishedAt,
            )}{" "}
            · {summary.heroesChanged} heroes · {summary.itemsChanged + summary.neutralItemsChanged}{" "}
            items
          </p>
          <a
            href={patch.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gold hover:underline"
          >
            Official notes on dota2.com <ExternalLink aria-hidden className="size-3.5" />
          </a>
        </div>
      </header>

      {patch.parseStatus !== "parsed" && (
        <div role="alert" className="panel flex gap-3 p-4 text-sm">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-gold" />
          <p className="text-muted-foreground">
            {patch.parseStatus === "failed"
              ? "We couldn't import these notes. Please read them on the official site using the link above."
              : "Some parts of these notes couldn't be imported, so this page may be incomplete. The official page has everything."}
          </p>
        </div>
      )}

      {nav.length > 1 && (
        <nav
          aria-label="Sections"
          className="sticky top-14 z-20 -mx-1 flex gap-1.5 overflow-x-auto rounded-xl border border-white/[0.06] bg-background/80 p-1.5 backdrop-blur-xl lg:top-3"
        >
          {nav.map((n) => (
            <a
              key={n.id}
              href={`#${n.id}`}
              className="rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-white/[0.05] hover:text-foreground"
            >
              {n.label}
            </a>
          ))}
        </nav>
      )}

      {yours.length > 0 && (
        <section
          id="your-heroes"
          aria-labelledby="your-heroes-title"
          className="scroll-mt-28 space-y-4"
        >
          <div>
            <p className="kicker">For you</p>
            <h2 id="your-heroes-title" className="text-2xl font-semibold">
              Changes to your heroes
            </h2>
            <p className="text-sm text-muted-foreground">
              Heroes you&apos;ve played 3+ ranked games on in the last 90 days, plus heroes
              you&apos;ve starred.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {yours.map((h) => (
              <HeroChangeCard
                key={h.heroId}
                change={h}
                hero={heroes.get(h.heroId)}
                cohort={cohorts.get(h.heroId)}
                action={watch(h.heroId)}
              />
            ))}
          </div>
        </section>
      )}

      {s.general.length > 0 && (
        <section id="general" aria-labelledby="general-title" className="scroll-mt-28 space-y-4">
          <h2 id="general-title" className="text-2xl font-semibold">
            General changes
          </h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {s.general.map((g, i) => (
              <article key={i} className="panel p-5">
                {g.title && <h3 className="mb-3 font-semibold">{g.title}</h3>}
                <NoteList notes={g.notes} />
              </article>
            ))}
          </div>
        </section>
      )}

      {s.heroes.length > 0 && (
        <section id="heroes" aria-labelledby="heroes-title" className="scroll-mt-28 space-y-4">
          <h2 id="heroes-title" className="text-2xl font-semibold">
            Heroes
          </h2>
          <ul aria-label="Jump to hero" className="flex flex-wrap gap-1.5">
            {sortedHeroes.map((h) => (
              <li key={h.heroId}>
                <a
                  href={`#hero-${h.heroId}`}
                  title={heroName(heroes.get(h.heroId), h.heroId)}
                  className="block rounded-md ring-gold/60 transition hover:ring-2 focus-visible:ring-2"
                >
                  <HeroPortrait hero={heroes.get(h.heroId)} heroId={h.heroId} size="sm" />
                  <span className="sr-only">{heroName(heroes.get(h.heroId), h.heroId)}</span>
                </a>
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {sortedHeroes.map((h) => (
              <HeroChangeCard
                key={h.heroId}
                change={h}
                hero={heroes.get(h.heroId)}
                action={watch(h.heroId)}
              />
            ))}
          </div>
        </section>
      )}

      {s.items.length > 0 && (
        <section id="items" aria-labelledby="items-title" className="scroll-mt-28 space-y-4">
          <h2 id="items-title" className="text-2xl font-semibold">
            Items
          </h2>
          <ItemChangeList items={s.items} />
        </section>
      )}

      {s.neutralItems.length > 0 && (
        <section
          id="neutral-items"
          aria-labelledby="neutral-title"
          className="scroll-mt-28 space-y-4"
        >
          <h2 id="neutral-title" className="text-2xl font-semibold">
            Neutral items
          </h2>
          <ItemChangeList items={s.neutralItems} />
        </section>
      )}

      {s.neutralCreeps.length > 0 && (
        <section id="creeps" aria-labelledby="creeps-title" className="scroll-mt-28 space-y-4">
          <h2 id="creeps-title" className="text-2xl font-semibold">
            Neutral creeps
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {s.neutralCreeps.map((c) => (
              <article key={c.key} className="rounded-xl border border-white/[0.06] bg-card/60 p-4">
                <h3 className="text-sm font-semibold">{c.name}</h3>
                <NoteList notes={c.notes} className="mt-1" />
              </article>
            ))}
          </div>
        </section>
      )}

      <p className="text-xs text-muted-foreground">
        Patch notes © Valve Corporation, shown in their original wording. Imported{" "}
        {new Intl.DateTimeFormat("en-US", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "UTC",
        }).format(patch.fetchedAt)}{" "}
        UTC
        {patch.parseRevision > 1 && ` (revision ${patch.parseRevision})`}.
      </p>
    </div>
  );
}
