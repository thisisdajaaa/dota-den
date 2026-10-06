import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { getT } from "@/common/i18n/server";
import { getCurrentUser } from "@/modules/identity";
import { matchesService } from "@/modules/matches";
import { parseAccountId } from "@/modules/players/domain/player-lookup";
import { displayName } from "@/modules/players/ui/player-avatar";
import { friendsService } from "@/modules/together";
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
import { playersService } from "@/modules/players";

export async function generateMetadata({
  params,
}: PageProps<"/together/[accountId]">): Promise<Metadata> {
  const t = await getT();
  const accountId32 = parseAccountId((await params).accountId);
  if (accountId32 === null) return { title: t("together.pairPage.notFound") };
  const profile = await playersService.publicProfile(accountId32);
  return {
    title: t("together.pairPage.titleWith", {
      name: displayName(profile?.personaName ?? null, accountId32),
    }),
  };
}

export default async function TogetherPairPage({ params }: PageProps<"/together/[accountId]">) {
  const user = await getCurrentUser();
  if (!user) return null;
  const friendId = parseAccountId((await params).accountId);
  if (friendId === null) notFound();
  if (friendId === user.accountId32) redirect("/together");
  const t = await getT();

  const [myProfile, friendProfile] = await Promise.all([
    playersService.publicProfile(user.accountId32),
    playersService.publicProfile(friendId),
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
        {t("together.pairPage.back")}
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
  const [analysis, heroes] = await Promise.all([
    friendsService.pairAnalysis(me, friendId),
    matchesService.heroMap(),
  ]);
  const now = new Date();
  const t = await getT();

  if (!analysis.ok) {
    return (
      <p role="alert" className="panel flex items-start gap-3 p-5 text-sm text-muted-foreground">
        <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-loss" />
        {analysis.error.type === "rate_limited"
          ? t("together.pairPage.sharedBusy")
          : t("together.pairPage.sharedError")}
      </p>
    );
  }

  const a = analysis.value;
  if (a.rows.length === 0) {
    return (
      <section className="panel space-y-2 p-6 text-sm">
        <h2 className="text-lg font-semibold">{t("together.pairPage.noSharedTitle")}</h2>
        <p className="text-muted-foreground">
          {t("together.pairPage.noSharedBody", { name: friendName })}
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
        {t(
          a.rows.length === 1 ? "together.pairPage.basedOn.one" : "together.pairPage.basedOn.other",
          { n: a.rows.length, name: friendName },
        )}
      </p>
    </div>
  );
}
