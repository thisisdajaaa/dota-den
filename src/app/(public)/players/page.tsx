import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AlertTriangle, Info, SearchX, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { logger } from "@/common/logging/logger";
import { getCurrentUser } from "@/modules/identity";
import type { TrackedPlayersPage } from "@/modules/players";
import type { PlayerProviderError as ProviderError } from "@/modules/players";
import { MAX_FOLLOWS_PER_USER } from "@/modules/players/domain/follow";
import { parsePlayerQuery, type LookupError } from "@/modules/players/domain/player-lookup";
import { PlayerSearchForm } from "@/modules/players/ui/player-search-form";
import { SearchResults } from "@/modules/players/ui/search-results";
import { TrackedPlayers } from "@/modules/players/ui/tracked-players";
import { ownerOf, playersService } from "@/modules/players";

export const metadata: Metadata = { title: "Players" };

const LOOKUP_ERRORS: Record<LookupError["type"], string> = {
  empty: "Type a name, account ID or profile link to search.",
  too_short: "Type at least 2 characters to search by name.",
  too_long: "That's too long for a player name. Names are at most 64 characters.",
};

function searchErrorCopy(error: ProviderError): string {
  if (error.type === "rate_limited")
    return "OpenDota is getting a lot of requests right now. Try again in a minute.";
  if (error.type === "unavailable" && error.cause === "TimeoutError")
    return "OpenDota's player search is slow right now. Try again (it's often quicker the second time), or paste an account ID or profile link to go straight to the profile.";
  return "Player search is unavailable right now. Try again shortly, or paste an account ID or profile link instead.";
}

export default async function PlayersPage({ searchParams }: PageProps<"/players">) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.slice(0, 200) : "";
  const pageParam = typeof params.page === "string" ? Number.parseInt(params.page, 10) : 1;
  const trackedPage = Number.isSafeInteger(pageParam) && pageParam > 0 ? pageParam : 1;

  const lookup = q.trim() ? parsePlayerQuery(q) : null;
  // IDs and profile links go straight to the profile.
  if (lookup?.ok && lookup.value.kind === "account")
    redirect(`/players/${lookup.value.accountId32}`);
  const nameLookup = lookup?.ok && lookup.value.kind === "name" ? lookup.value : null;

  const viewer = await getCurrentUser({ tolerateErrors: true });
  const tracked = viewer
    ? await playersService
        .trackedPlayers(ownerOf(viewer), trackedPage)
        .catch((e: unknown): TrackedPlayersPage | "error" => {
          logger.error("tracked_players_failed", { error: e });
          return "error";
        })
    : null;
  const now = new Date();
  const pageHref = (page: number) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (page > 1) sp.set("page", String(page));
    const s = sp.toString();
    return s ? `/players?${s}` : "/players";
  };

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Community"
        title="Players"
        description="Look up any Dota 2 player with public match data: their record, favourite heroes and who they queue with."
      />

      <PlayerSearchForm defaultValue={q} />

      {lookup && !lookup.ok && (
        <Notice icon="info" role="status">
          {LOOKUP_ERRORS[lookup.error.type]}
        </Notice>
      )}

      {tracked === "error" ? (
        <Notice icon="alert" role="alert">
          Couldn&apos;t load your tracked players right now. Try again shortly.
        </Notice>
      ) : (
        tracked && (
          <TrackedPlayers
            data={tracked}
            limit={MAX_FOLLOWS_PER_USER}
            now={now}
            pageHref={pageHref}
          />
        )
      )}

      {nameLookup?.vanity && (
        <Notice icon="info" role="status">
          Steam custom profile links can&apos;t be looked up directly, so we searched for the name “
          {nameLookup.q}” instead. For an exact match, paste a link with the number in it
          (steamcommunity.com/profiles/…) or the account ID.
        </Notice>
      )}

      {nameLookup && (
        // OpenDota's search can take seconds: show the page now and the results when ready.
        <Suspense key={nameLookup.q} fallback={<SearchingSkeleton q={nameLookup.q} />}>
          <SearchSection q={nameLookup.q} now={now} />
        </Suspense>
      )}

      {!q.trim() && !viewer && (
        <section className="panel flex items-start gap-3 p-5 text-sm text-muted-foreground">
          <Users aria-hidden className="mt-0.5 size-5 shrink-0 text-gold" />
          <p>
            Search by name to see matching players, or paste an account ID or profile link to jump
            straight to their profile. Sign in to keep a list of players you track.
          </p>
        </section>
      )}
    </div>
  );
}

function Notice({
  icon,
  role,
  children,
}: {
  icon: "info" | "alert";
  role: "status" | "alert";
  children: React.ReactNode;
}) {
  const Icon = icon === "alert" ? AlertTriangle : Info;
  return (
    <p role={role} className="panel flex items-start gap-3 p-4 text-sm text-muted-foreground">
      <Icon
        aria-hidden
        className={
          icon === "alert" ? "mt-0.5 size-4 shrink-0 text-loss" : "mt-0.5 size-4 shrink-0 text-gold"
        }
      />
      <span>{children}</span>
    </p>
  );
}

async function SearchSection({ q, now }: { q: string; now: Date }) {
  const search = await playersService.search(q);
  if (!search.ok) {
    return (
      <Notice icon="alert" role="alert">
        {searchErrorCopy(search.error)}{" "}
        <a href={`/players?q=${encodeURIComponent(q)}`} className="text-gold hover:underline">
          Try again
        </a>
      </Notice>
    );
  }
  if (search.value.length === 0) {
    return (
      <section className="panel grid place-items-center gap-3 px-6 py-12 text-center" role="status">
        <SearchX aria-hidden className="size-8 text-muted-foreground" />
        <h2 className="text-lg font-semibold">No players found for “{q}”</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Check the spelling, or paste their account ID or a Steam, Dotabuff or OpenDota profile
          link instead. Only players with public match data can be found.
        </p>
      </section>
    );
  }
  return <SearchResults q={q} hits={search.value} now={now} />;
}

function SearchingSkeleton({ q }: { q: string }) {
  return (
    <section className="panel space-y-3 p-5" aria-busy aria-label="Searching">
      <p role="status" className="text-sm text-muted-foreground">
        Searching OpenDota for “{q}”… this can take a few seconds.
      </p>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40 max-w-full" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
    </section>
  );
}
