import type { Metadata } from "next";
import { getT } from "@/common/i18n/server";
import { MAX_GROUPS_PER_USER } from "@/modules/groups/domain/group";
import { getCurrentUser } from "@/modules/identity";
import { MAX_STREAMER_FOLLOWS } from "@/modules/live/domain/streams";
import { MAX_FOLLOWS_PER_USER } from "@/modules/players/domain/follow";
import { plusService } from "@/modules/plus";
import { limitFor } from "@/modules/plus/domain/plans";
import { PlusPricing } from "@/modules/plus/ui/plus-pricing";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("plus.page.title"), description: t("plus.page.lead") };
}

/** Dota Den Plus: what stays free, what Plus adds, and (when on sale) the plans (ADR 0013). */
export default async function PlusPage() {
  const user = await getCurrentUser({ tolerateErrors: true });
  const offer = plusService.offer();
  const plan = user && offer.status !== "off" ? await plusService.plan(user.id) : null;
  return (
    <PlusPricing
      offer={offer}
      signedIn={user !== null}
      plan={plan}
      limits={{
        players: limitFor(MAX_FOLLOWS_PER_USER, true),
        streamers: limitFor(MAX_STREAMER_FOLLOWS, true),
        groups: limitFor(MAX_GROUPS_PER_USER, true),
      }}
    />
  );
}
