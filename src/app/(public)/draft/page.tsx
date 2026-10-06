import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Eye, History, Puzzle, Users } from "lucide-react";
import { getT } from "@/common/i18n/server";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { matchesService } from "@/modules/matches";
import { decodeSnapshot, replaySnapshot } from "@/modules/drafts/domain/snapshot";
import { getRuleset } from "@/modules/drafts/domain/rulesets";
import { DraftBoard } from "@/modules/drafts/ui/draft-board";
import { FeedbackPanel } from "@/modules/drafts/ui/feedback-panel";
import { getCurrentUser } from "@/modules/identity";
import { SequenceStrip } from "@/modules/drafts/ui/sequence-strip";
import { TeamPanel } from "@/modules/drafts/ui/team-panel";
import { rulesetName } from "@/modules/drafts/ui/i18n";
import type { DraftHero } from "@/modules/drafts/ui/types";

export async function generateMetadata({ searchParams }: PageProps<"/draft">): Promise<Metadata> {
  const { snapshot } = await searchParams;
  const t = await getT();
  if (typeof snapshot !== "string" || snapshot.length > 2_000)
    return { title: t("drafts.pages.metaTitle") };
  // Shared drafts get a preview image with both lineups and the report card.
  const image = `/api/og/draft?snapshot=${encodeURIComponent(snapshot)}`;
  return {
    title: t("drafts.pages.sharedTitle"),
    description: t("drafts.pages.sharedDescription"),
    openGraph: { images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", images: [image] },
  };
}

export default async function DraftPage({ searchParams }: PageProps<"/draft">) {
  const { snapshot } = await searchParams;
  const t = await getT();
  const [heroMap, user] = await Promise.all([
    matchesService.heroMap(),
    // Only decides whether finished drafts are saved; an outage just skips that.
    getCurrentUser({ tolerateErrors: true }),
  ]);
  const heroes: DraftHero[] = [...heroMap.values()]
    .map((h) => ({
      id: h.id,
      name: h.name,
      imageUrl: h.imageUrl,
      iconUrl: h.iconUrl,
      primaryAttr: h.primaryAttr,
      roles: h.roles,
      attackType: h.attackType,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (heroes.length === 0) {
    return (
      <section className="panel grid place-items-center gap-3 px-6 py-16 text-center" role="alert">
        <AlertTriangle aria-hidden className="size-8 text-gold" />
        <h1 className="text-lg font-semibold">{t("drafts.pages.heroesUnavailable")}</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          {t("drafts.pages.heroesUnavailableBody")}
        </p>
      </section>
    );
  }

  if (typeof snapshot === "string") {
    const decoded = decodeSnapshot(snapshot);
    const replayed = decoded.ok
      ? replaySnapshot(
          decoded.value,
          heroes.map((h) => h.id),
        )
      : decoded;
    if (!replayed.ok) {
      return (
        <div className="space-y-6">
          <PageHeader kicker={t("drafts.pages.kicker")} title={t("drafts.pages.sharedTitle")} />
          <section
            className="panel grid place-items-center gap-3 px-6 py-16 text-center"
            role="alert"
          >
            <AlertTriangle aria-hidden className="size-8 text-gold" />
            <h2 className="text-lg font-semibold">{t("drafts.pages.brokenTitle")}</h2>
            <p className="max-w-md text-sm text-muted-foreground">{t("drafts.pages.brokenBody")}</p>
            <Button asChild>
              <Link href="/draft">{t("drafts.pages.startNew")}</Link>
            </Button>
          </section>
        </div>
      );
    }
    const state = replayed.value;
    const rulesetRes = getRuleset(state.rulesetId, state.rulesetVersion);
    const sequence = rulesetRes.ok ? rulesetRes.value.sequence : [];
    const perSide = (action: "pick" | "ban") =>
      sequence.filter((s) => s.action === action).length / 2;
    const map = new Map(heroes.map((h) => [h.id, h]));
    return (
      <div className="space-y-6">
        <PageHeader
          kicker={t("drafts.pages.kicker")}
          title={t("drafts.pages.sharedTitle")}
          description={rulesetRes.ok ? rulesetName(t, rulesetRes.value) : undefined}
          actions={
            <Button asChild>
              <Link href="/draft">{t("drafts.pages.startOwn")}</Link>
            </Button>
          }
        />
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Eye aria-hidden className="size-4" /> {t("drafts.pages.readOnly")}
          {state.status !== "completed" &&
            t("drafts.pages.stoppedAfter", { step: state.turns.length, total: sequence.length })}
        </p>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {(["radiant", "dire"] as const).map((side) => (
            <TeamPanel
              key={side}
              side={side}
              picks={state.sides[side].picks}
              bans={state.sides[side].bans}
              heroes={map}
              totalPicks={perSide("pick")}
              totalBans={perSide("ban")}
              activeAction={null}
              isFirst={state.firstSide === side}
              reserveLabel={null}
            />
          ))}
        </div>
        <div className="panel p-3">
          <SequenceStrip
            sequence={sequence}
            firstSide={state.firstSide}
            turns={state.turns}
            stepIndex={state.stepIndex}
            heroes={map}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {(["radiant", "dire"] as const).map((side) => (
            <FeedbackPanel
              key={side}
              side={side}
              picks={state.sides[side].picks
                .map((p) => map.get(p.heroId))
                .filter((h): h is DraftHero => !!h)}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        kicker={t("drafts.pages.kicker")}
        title={t("drafts.pages.title")}
        description={t("drafts.pages.description")}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/draft/rooms/new">
                <Users aria-hidden className="size-4" /> {t("drafts.pages.withFriend")}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/draft/rooms/history">
                <History aria-hidden className="size-4" /> {t("drafts.pages.history")}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/draft/challenges">
                <Puzzle aria-hidden className="size-4" /> {t("drafts.pages.challenges")}
              </Link>
            </Button>
          </>
        }
      />
      <DraftBoard heroes={heroes} signedIn={user !== null} />
    </div>
  );
}
