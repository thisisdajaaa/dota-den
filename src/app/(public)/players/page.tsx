import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AlertTriangle, Info, SearchX, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getT } from "@/common/i18n/server";
import type { Messages } from "@/common/i18n/messages";
import type { Translator } from "@/common/i18n/translate";
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

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("players.page.title") };
}

const LOOKUP_ERRORS = {
  empty: "lookupEmpty",
  too_short: "lookupTooShort",
  too_long: "lookupTooLong",
} as const satisfies Record<LookupError["type"], string>;

function searchErrorCopy(t: Translator<Messages>, error: ProviderError): string {
  if (error.type === "rate_limited") return t("players.page.searchBusy");
  if (error.type === "unavailable" && error.cause === "TimeoutError")
    return t("players.page.searchSlow");
  return t("players.page.searchUnavailable");
}

export default async function PlayersPage({ searchParams }: PageProps<"/players">) {
  const params = await searchParams;
  const t = await getT();
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
        kicker={t("players.page.kicker")}
        title={t("players.page.title")}
        description={t("players.page.description")}
      />

      <PlayerSearchForm defaultValue={q} />

      {lookup && !lookup.ok && (
        <Notice icon="info" role="status">
          {t(`players.page.${LOOKUP_ERRORS[lookup.error.type]}`)}
        </Notice>
      )}

      {tracked === "error" ? (
        <Notice icon="alert" role="alert">
          {t("players.page.trackedError")}
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
          {t("players.page.vanity", { q: nameLookup.q })}
        </Notice>
      )}

      {nameLookup && (
        // OpenDota's search can take seconds: show the page now and the results when ready.
        <Suspense key={nameLookup.q} fallback={<SearchingSkeleton t={t} q={nameLookup.q} />}>
          <SearchSection q={nameLookup.q} now={now} />
        </Suspense>
      )}

      {!q.trim() && !viewer && (
        <section className="panel flex items-start gap-3 p-5 text-sm text-muted-foreground">
          <Users aria-hidden className="mt-0.5 size-5 shrink-0 text-gold" />
          <p>{t("players.page.intro")}</p>
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
  const [search, t] = await Promise.all([playersService.search(q), getT()]);
  if (!search.ok) {
    return (
      <Notice icon="alert" role="alert">
        {searchErrorCopy(t, search.error)}{" "}
        <a href={`/players?q=${encodeURIComponent(q)}`} className="text-gold hover:underline">
          {t("players.page.tryAgain")}
        </a>
      </Notice>
    );
  }
  if (search.value.length === 0) {
    return (
      <section className="panel grid place-items-center gap-3 px-6 py-12 text-center" role="status">
        <SearchX aria-hidden className="size-8 text-muted-foreground" />
        <h2 className="text-lg font-semibold">{t("players.page.noResultsTitle", { q })}</h2>
        <p className="max-w-md text-sm text-muted-foreground">{t("players.page.noResultsBody")}</p>
      </section>
    );
  }
  return <SearchResults q={q} hits={search.value} now={now} />;
}

function SearchingSkeleton({ t, q }: { t: Translator<Messages>; q: string }) {
  return (
    <section
      className="panel space-y-3 p-5"
      aria-busy
      aria-label={t("players.page.searchingLabel")}
    >
      <p role="status" className="text-sm text-muted-foreground">
        {t("players.page.searching", { q })}
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
