import type { Metadata } from "next";
import Link from "next/link";
import { History } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { getDraftHeroes, getDraftHistoryService } from "@/modules/drafts/composition";
import {
  FriendFilter,
  HeadToHeadSummary,
  historyHref,
  HistoryList,
} from "@/modules/drafts/ui/draft-history";
import { getCurrentUser } from "@/modules/identity/composition";

export const metadata: Metadata = { title: "Your draft history" };

function positiveInt(value: string | string[] | undefined): number | null {
  if (typeof value !== "string" || !/^\d{1,10}$/.test(value)) return null;
  const n = Number(value);
  return n > 0 && n <= 0xffffffff ? n : null;
}

export default async function DraftHistoryPage({
  searchParams,
}: PageProps<"/draft/rooms/history">) {
  const params = await searchParams;
  const user = await getCurrentUser({ tolerateErrors: true });
  const header = (
    <PageHeader
      kicker="Draft with a friend"
      title="Your draft history"
      description="Every finished room draft you captained, newest first. Filter by friend to see your head-to-head."
      actions={
        <Button asChild variant="outline">
          <Link href="/draft/rooms/new">New room</Link>
        </Button>
      }
    />
  );
  if (!user) {
    return (
      <div className="space-y-6">
        {header}
        <section className="panel grid max-w-xl gap-3 p-5">
          <p className="text-sm text-muted-foreground">
            Sign in to see the drafts you&apos;ve done with friends.
          </p>
          <Button asChild className="justify-self-start">
            {/* Full navigation: the route redirects to Steam. */}
            <a href="/api/v1/auth/steam/login">Sign in through Steam</a>
          </Button>
        </section>
      </div>
    );
  }

  const requested = positiveInt(params.friend);
  // Filtering by your own account would match every draft.
  const friend = requested === user.accountId32 ? null : requested;
  const pageNo = positiveInt(params.page) ?? 1;
  const service = await getDraftHistoryService();
  const [opponents, page, summary, heroList] = await Promise.all([
    service.opponents(user.id),
    service.list(user.id, { friendAccountId: friend, page: pageNo }),
    friend !== null ? service.headToHead(user.id, friend) : Promise.resolve(null),
    getDraftHeroes(),
  ]);
  const heroes = new Map(heroList.map((h) => [h.id, h]));

  return (
    <div className="space-y-6">
      {header}
      {opponents.length > 0 && <FriendFilter opponents={opponents} active={friend} />}
      {summary && <HeadToHeadSummary summary={summary} heroes={heroes} />}
      {page.items.length === 0 ? (
        <section className="panel grid place-items-center gap-3 px-6 py-16 text-center">
          <History aria-hidden className="size-8 text-muted-foreground" />
          <h2 className="text-lg font-semibold">No recorded drafts</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            {friend !== null
              ? "You haven't finished a draft with this player yet."
              : page.total > 0
                ? "This page is empty."
                : "When you finish a draft in a room with a friend, it's saved here."}
          </p>
          <Link
            href={page.total > 0 ? historyHref({ friend }) : "/draft/rooms/new"}
            className="text-sm text-gold hover:underline"
          >
            {page.total > 0 ? "Back to the newest drafts" : "Open a room"}
          </Link>
        </section>
      ) : (
        <HistoryList page={page} heroes={heroes} friend={friend} />
      )}
    </div>
  );
}
