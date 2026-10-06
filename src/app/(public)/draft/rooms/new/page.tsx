import type { Metadata } from "next";
import Link from "next/link";
import { History } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { env } from "@/common/config/env";
import { getT } from "@/common/i18n/server";
import { getCurrentUser } from "@/modules/identity";
import { NewRoomForm } from "@/modules/drafts/ui/new-room-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("drafts.newRoomPage.metaTitle") };
}

export default async function NewDraftRoomPage() {
  const user = await getCurrentUser({ tolerateErrors: true });
  const enabled = env().FEATURE_DRAFT_ROOMS;
  const t = await getT();
  return (
    <div className="space-y-6">
      <PageHeader
        kicker={t("drafts.pages.kicker")}
        title={t("drafts.newRoomPage.title")}
        description={t("drafts.newRoomPage.description")}
        actions={
          <>
            {user && (
              <Button asChild variant="outline">
                <Link href="/draft/rooms/history">
                  <History aria-hidden className="size-4" /> {t("drafts.pages.history")}
                </Link>
              </Button>
            )}
            <Button asChild variant="outline">
              <Link href="/draft">{t("drafts.pages.backToDrafting")}</Link>
            </Button>
          </>
        }
      />
      {!enabled ? (
        <p className="panel p-5 text-sm text-muted-foreground">{t("drafts.newRoomPage.off")}</p>
      ) : user ? (
        <NewRoomForm />
      ) : (
        <section className="panel grid max-w-xl gap-3 p-5">
          <p className="text-sm text-muted-foreground">{t("drafts.newRoomPage.signIn")}</p>
          <Button asChild className="justify-self-start">
            {/* Full navigation: the route redirects to Steam. */}
            <a href="/api/v1/auth/steam/login">{t("drafts.pages.signInSteam")}</a>
          </Button>
        </section>
      )}
    </div>
  );
}
