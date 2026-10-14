import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { env } from "@/common/config/env";
import { getT } from "@/common/i18n/server";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser, type User } from "@/modules/identity";
import { groupPageService, groupsService } from "@/modules/groups";
import { GROUP_ID_PATTERN } from "@/modules/groups/domain/group";
import { GroupActions } from "@/modules/groups/ui/group-actions";
import { HeroesCard } from "@/modules/groups/ui/heroes-card";
import { InviteLink } from "@/modules/groups/ui/invite-link";
import { memberLookup, type MemberLookup } from "@/modules/groups/ui/member-names";
import { MembersCard } from "@/modules/groups/ui/members-card";
import { PartyCard } from "@/modules/groups/ui/party-card";
import { WeeklyBoardCard } from "@/modules/groups/ui/weekly-board-card";
import { matchesService } from "@/modules/matches";

type Group = NonNullable<Awaited<ReturnType<typeof groupsService.findForMember>>>;

/** The group for a member; null (shown as not found) for anyone else or a malformed id. */
const load = (user: User, id: string) =>
  GROUP_ID_PATTERN.test(id) ? groupsService.findForMember(user, id) : Promise.resolve(null);

export async function generateMetadata({ params }: PageProps<"/groups/[id]">): Promise<Metadata> {
  const t = await getT();
  const user = await getCurrentUser();
  const group = user ? await load(user, (await params).id) : null;
  return { title: group?.name ?? t("groups.group.notFoundTitle"), robots: { index: false } };
}

export default async function GroupPage({ params }: PageProps<"/groups/[id]">) {
  const user = await getCurrentUser();
  if (!user) return null;
  // Before any streaming, so a non-member gets a real 404.
  const group = await load(user, (await params).id);
  if (!group) notFound();
  const t = await getT();
  const view = await groupsService.view(user, group);
  const members = memberLookup(view.members);

  return (
    <div className="space-y-6">
      <Link
        href="/groups"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden className="size-4" />
        {t("groups.group.back")}
      </Link>
      <header className="space-y-1.5">
        <p className="kicker">{t("groups.group.kicker")}</p>
        <h1 className="font-display text-3xl font-bold tracking-wide break-words sm:text-4xl">
          {view.name}
        </h1>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Suspense fallback={<Skeleton className="h-96 rounded-2xl" />}>
            <PartySection group={group} members={members} />
          </Suspense>
          <Suspense fallback={<Skeleton className="h-64 rounded-2xl" />}>
            <BoardSection group={group} members={members} />
          </Suspense>
          <Suspense fallback={<Skeleton className="h-64 rounded-2xl" />}>
            <HeroesSection group={group} members={members} />
          </Suspense>
        </div>
        <div className="space-y-6 lg:col-span-2">
          <MembersCard groupId={view.id} members={view.members} canRemove={view.isOwner} />
          <InviteLink
            groupId={view.id}
            invitePath={view.invitePath}
            appUrl={env().APP_URL}
            canReset={view.isOwner}
          />
          <GroupActions groupId={view.id} name={view.name} isOwner={view.isOwner} />
        </div>
      </div>
    </div>
  );
}

async function PartySection({ group, members }: { group: Group; members: MemberLookup }) {
  const party = await groupPageService.party(group);
  return <PartyCard party={party} members={members} now={new Date()} />;
}

async function BoardSection({ group, members }: { group: Group; members: MemberLookup }) {
  const board = await groupPageService.weeklyBoard(group);
  return <WeeklyBoardCard board={board} members={members} />;
}

async function HeroesSection({ group, members }: { group: Group; members: MemberLookup }) {
  const [rows, heroes] = await Promise.all([
    groupPageService.heroes(group),
    matchesService.heroMap(),
  ]);
  return <HeroesCard rows={rows} members={members} heroes={heroes} />;
}
