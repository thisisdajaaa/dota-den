import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/modules/identity/composition";
import { getHeroMap } from "@/modules/matches/composition";
import { getPublicProfile } from "@/modules/players/composition";
import { parseAccountId } from "@/modules/players/domain/player-lookup";
import { displayName } from "@/modules/players/ui/player-avatar";
import { getPairAnalysis } from "@/modules/together/composition";
import {
  FormTogether,
  HeroPairsTable,
  OtherSharedMatches,
  PairBanner,
  PairStats,
  PartyMatches,
  PendingNotice,
} from "@/modules/together/ui/pair-sections";
import { PairAnalysisSkeleton } from "@/modules/together/ui/pair-skeleton";

export async function generateMetadata({
  params,
}: PageProps<"/together/[accountId]">): Promise<Metadata> {
  const accountId32 = parseAccountId((await params).accountId);
  if (accountId32 === null) return { title: "Player not found" };
  const profile = await getPublicProfile(accountId32);
  return { title: `Together with ${displayName(profile?.personaName ?? null, accountId32)}` };
}

export default async function TogetherPairPage({ params }: PageProps<"/together/[accountId]">) {
  const user = await getCurrentUser();
  if (!user) return null;
  const friendId = parseAccountId((await params).accountId);
  if (friendId === null) notFound();
  if (friendId === user.accountId32) redirect("/together");

  const [myProfile, friendProfile] = await Promise.all([
    getPublicProfile(user.accountId32),
    getPublicProfile(friendId),
  ]);
  const me = {
    accountId32: user.accountId32,
    personaName: myProfile?.personaName ?? user.persona?.name ?? null,
    avatarUrl: myProfile?.avatarUrl ?? null,
  };
  const friend = {
    accountId32: friendId,
    personaName: friendProfile?.personaName ?? null,
    avatarUrl: friendProfile?.avatarUrl ?? null,
  };

  return (
    <div className="space-y-6">
      <Link
        href="/together"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden className="size-4" />
        All friends
      </Link>
      <PairBanner me={me} friend={friend} />
      <Suspense fallback={<PairAnalysisSkeleton />}>
        <PairAnalysisSection
          me={user.accountId32}
          friendId={friendId}
          friendName={displayName(friend.personaName, friendId)}
        />
      </Suspense>
    </div>
  );
}

async function PairAnalysisSection({
  me,
  friendId,
  friendName,
}: {
  me: number;
  friendId: number;
  friendName: string;
}) {
  const [analysis, heroes] = await Promise.all([getPairAnalysis(me, friendId), getHeroMap()]);
  const now = new Date();

  if (!analysis.ok) {
    return (
      <p role="alert" className="panel flex items-start gap-3 p-5 text-sm text-muted-foreground">
        <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-loss" />
        {analysis.error.type === "rate_limited"
          ? "OpenDota is busy right now, so we couldn't load your shared matches. Try again in a minute."
          : "Couldn't load your shared matches from OpenDota right now. Try again shortly."}
      </p>
    );
  }

  const a = analysis.value;
  if (a.rows.length === 0) {
    return (
      <section className="panel space-y-2 p-6 text-sm">
        <h2 className="text-lg font-semibold">No shared matches yet</h2>
        <p className="text-muted-foreground">
          OpenDota has no public match with both you and {friendName}. Games show up once both of
          you have “Expose Public Match Data” turned on in Dota 2.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <PendingNotice
        pending={a.pending}
        interrupted={a.interrupted}
        href={`/together/${friendId}`}
      />
      <PairStats analysis={a} now={now} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <PartyMatches rows={a.rows} heroes={heroes} now={now} />
        </div>
        <div className="space-y-6 lg:col-span-2">
          <FormTogether form={a.summary.form} heroes={heroes} />
          <HeroPairsTable pairs={a.heroPairs} heroes={heroes} friendName={friendName} />
        </div>
      </div>
      <OtherSharedMatches rows={a.rows} heroes={heroes} now={now} friendName={friendName} />
      <p className="text-xs text-muted-foreground">
        Based on your {a.rows.length === 1 ? "one" : a.rows.length} most recent public{" "}
        {a.rows.length === 1 ? "match" : "matches"} with {friendName} on OpenDota.
      </p>
    </div>
  );
}
