import type { Metadata } from "next";
import { getT } from "@/common/i18n/server";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { askService } from "@/modules/assistant";
import { AskChat } from "@/modules/assistant/ui/ask-chat";
import { getCurrentUser } from "@/modules/identity";
import { plusService } from "@/modules/plus";
import { BotMessageSquare } from "lucide-react";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("ask.title") };
}

const MATCH_ID = /^\d{1,20}$/;

export default async function AskPage({ searchParams }: PageProps<"/ask">) {
  const user = await getCurrentUser();
  if (!user) return null;
  const t = await getT();
  const { match } = await searchParams;
  const matchId = typeof match === "string" && MATCH_ID.test(match) ? match : undefined;
  const state = await askService
    .state({ userId: user.id, accountId32: user.accountId32 })
    .catch(() => null);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader
        kicker={t("ask.kicker")}
        title={t("ask.heading")}
        description={t("ask.description")}
      />
      {state?.enabled ? (
        <AskChat
          initialMessages={state.messages}
          initialQuota={state.quota}
          plusLimit={state.plusLimit}
          plusOnSale={plusService.offer().status === "available"}
          matchId={matchId}
          initialQuestion={matchId ? t("ask.match.question") : undefined}
        />
      ) : (
        <EmptyState icon={BotMessageSquare} title={t("ask.off")} />
      )}
    </div>
  );
}
