import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { getCurrentUser } from "@/modules/identity/composition";
import { getTogetherCandidates } from "@/modules/together/composition";
import { FriendList } from "@/modules/together/ui/friend-list";
import { TriosCard, type TrioMember } from "@/modules/together/ui/trios-card";

export const metadata: Metadata = { title: "Play together" };

export default async function TogetherPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const now = new Date();
  const { friends, overview, peersError } = await getTogetherCandidates(user);

  const members = new Map<number, TrioMember>(
    friends.map((f) => [f.accountId32, { personaName: f.personaName, avatarUrl: f.avatarUrl }]),
  );
  const peersErrorCopy = peersError
    ? peersError.type === "rate_limited"
      ? "OpenDota is busy right now, so we couldn't load your teammates. Try again in a minute."
      : "Couldn't load your teammates from OpenDota right now. Try again shortly."
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Group play"
        title="Play together"
        description="How you do with the friends you queue with. Only games where you were in the same party count as together; sharing a team by chance doesn't."
      />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <FriendList friends={friends} now={now} error={peersErrorCopy} />
        </div>
        <div className="space-y-6 lg:col-span-2">
          <TriosCard trios={overview.trios} members={members} />
          <section className="panel flex items-start gap-3 p-5 text-sm" aria-labelledby="how">
            <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-gold" />
            <div className="space-y-1">
              <h2 id="how" className="font-semibold">
                How “together” is decided
              </h2>
              <p className="text-muted-foreground">
                We check each shared match for the party both of you were in. Games on the same team
                without party data, and games against each other, are listed separately and never
                counted. Missing someone?{" "}
                <Link href="/players" className="text-gold hover:underline">
                  Track them
                </Link>{" "}
                and they&apos;ll show up here.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
