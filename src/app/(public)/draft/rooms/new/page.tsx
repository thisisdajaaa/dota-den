import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { env } from "@/lib/env";
import { getCurrentUser } from "@/modules/identity/composition";
import { NewRoomForm } from "@/modules/drafts/ui/new-room-form";

export const metadata: Metadata = { title: "New draft room" };

export default async function NewDraftRoomPage() {
  const user = await getCurrentUser({ tolerateErrors: true });
  const enabled = env().FEATURE_DRAFT_ROOMS;
  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Draft practice"
        title="Draft against a friend"
        description="Create a room, send the link, and draft live: one captain on each side, with the real Captain's Mode order and timer. Anyone with the link can watch."
        actions={
          <Button asChild variant="outline">
            <Link href="/draft">Back to drafting</Link>
          </Button>
        }
      />
      {!enabled ? (
        <p className="panel p-5 text-sm text-muted-foreground">
          Draft rooms are turned off right now.
        </p>
      ) : user ? (
        <NewRoomForm />
      ) : (
        <section className="panel grid max-w-xl gap-3 p-5">
          <p className="text-sm text-muted-foreground">
            Sign in so your friend can see who they&apos;re drafting against.
          </p>
          <Button asChild className="justify-self-start">
            {/* Full navigation: the route redirects to Steam. */}
            <a href="/api/v1/auth/steam/login">Sign in through Steam</a>
          </Button>
        </section>
      )}
    </div>
  );
}
