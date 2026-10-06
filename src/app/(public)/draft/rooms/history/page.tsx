import type { Metadata } from "next";
import Link from "next/link";
import { History } from "lucide-react";
import { getT } from "@/common/i18n/server";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { draftHistoryService, getDraftHeroes } from "@/modules/drafts";
import {
  FriendFilter,
  HeadToHeadSummary,
  historyHref,
  HistoryList,
} from "@/modules/drafts/ui/draft-history";
import { getCurrentUser } from "@/modules/identity";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("drafts.historyPage.metaTitle") };
}

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
  const t = await getT();
  const header = (
    <PageHeader
      kicker={t("drafts.historyPage.kicker")}
      title={t("drafts.historyPage.title")}
      description={t("drafts.historyPage.description")}
      actions={
        <Button asChild variant="outline">
          <Link href="/draft/rooms/new">{t("drafts.historyPage.newRoom")}</Link>
        </Button>
      }
    />
  );
  if (!user) {
    return (
      <div className="space-y-6">
        {header}
        <section className="panel grid max-w-xl gap-3 p-5">
          <p className="text-sm text-muted-foreground">{t("drafts.historyPage.signIn")}</p>
          <Button asChild className="justify-self-start">
            {/* Full navigation: the route redirects to Steam. */}
            <a href="/api/v1/auth/steam/login">{t("drafts.pages.signInSteam")}</a>
          </Button>
        </section>
      </div>
    );
  }

  const requested = positiveInt(params.friend);
  // Filtering by your own account would match every draft.
  const friend = requested === user.accountId32 ? null : requested;
  const pageNo = positiveInt(params.page) ?? 1;
  const service = draftHistoryService;
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
          <h2 className="text-lg font-semibold">{t("drafts.historyPage.emptyTitle")}</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            {friend !== null
              ? t("drafts.historyPage.emptyFriend")
              : page.total > 0
                ? t("drafts.historyPage.emptyPage")
                : t("drafts.historyPage.emptyNone")}
          </p>
          <Link
            href={page.total > 0 ? historyHref({ friend }) : "/draft/rooms/new"}
            className="text-sm text-gold hover:underline"
          >
            {page.total > 0 ? t("drafts.historyPage.backNewest") : t("drafts.historyPage.openRoom")}
          </Link>
        </section>
      ) : (
        <HistoryList page={page} heroes={heroes} friend={friend} />
      )}
    </div>
  );
}
