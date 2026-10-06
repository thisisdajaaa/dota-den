import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { getT } from "@/common/i18n/server";
import { PageHeader } from "@/components/page-header";
import { getCurrentUser } from "@/modules/identity";
import { friendsService } from "@/modules/together";
import { FriendList } from "@/modules/together/ui/friend-list";
import { StacksCard } from "@/modules/together/ui/stacks-card";
import { TriosCard, type TrioMember } from "@/modules/together/ui/trios-card";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("together.page.title") };
}

export default async function TogetherPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const t = await getT();
  const now = new Date();
  const { friends, overview, peersError } = await friendsService.candidates(user);

  const members = new Map<number, TrioMember>(
    friends.map((f) => [f.accountId32, { personaName: f.personaName, avatarUrl: f.avatarUrl }]),
  );
  const peersErrorCopy = peersError
    ? peersError.type === "rate_limited"
      ? t("together.page.peersBusy")
      : t("together.page.peersError")
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        kicker={t("together.page.kicker")}
        title={t("together.page.title")}
        description={t("together.page.description")}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <FriendList friends={friends} now={now} error={peersErrorCopy} />
        </div>
        <div className="space-y-6 lg:col-span-2">
          <StacksCard
            stacks={overview.stacks}
            members={members}
            unknownPartyGames={overview.unknownPartyGames}
          />
          <TriosCard trios={overview.trios} members={members} />
          <section className="panel flex items-start gap-3 p-5 text-sm" aria-labelledby="how">
            <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-gold" />
            <div className="space-y-1">
              <h2 id="how" className="font-semibold">
                {t("together.page.howTitle")}
              </h2>
              <p className="text-muted-foreground">
                {t("together.page.howBody")}{" "}
                <Link href="/players" className="text-gold hover:underline">
                  {t("together.page.howLink")}
                </Link>{" "}
                {t("together.page.howAfter")}
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
