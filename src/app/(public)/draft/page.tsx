import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Eye } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { getHeroMap } from "@/modules/matches/composition";
import { decodeSnapshot, replaySnapshot } from "@/modules/drafts/application/snapshot";
import { getRuleset } from "@/modules/drafts/domain/rulesets";
import { DraftBoard } from "@/modules/drafts/ui/draft-board";
import { FeedbackPanel } from "@/modules/drafts/ui/feedback-panel";
import { SequenceStrip } from "@/modules/drafts/ui/sequence-strip";
import { TeamPanel } from "@/modules/drafts/ui/team-panel";
import type { DraftHero } from "@/modules/drafts/ui/types";

export const metadata: Metadata = { title: "Draft practice" };

export default async function DraftPage({ searchParams }: PageProps<"/draft">) {
  const { snapshot } = await searchParams;
  const heroMap = await getHeroMap();
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
        <h1 className="text-lg font-semibold">Hero list unavailable</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          We couldn&apos;t load the hero list from OpenDota. Please try again in a minute.
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
          <PageHeader kicker="Draft practice" title="Shared draft" />
          <section
            className="panel grid place-items-center gap-3 px-6 py-16 text-center"
            role="alert"
          >
            <AlertTriangle aria-hidden className="size-8 text-gold" />
            <h2 className="text-lg font-semibold">This draft link is broken</h2>
            <p className="max-w-md text-sm text-muted-foreground">
              It may have been cut off or edited. Ask for a fresh link, or start your own draft.
            </p>
            <Button asChild>
              <Link href="/draft">Start a new draft</Link>
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
          kicker="Draft practice"
          title="Shared draft"
          description={rulesetRes.ok ? rulesetRes.value.name : undefined}
          actions={
            <Button asChild>
              <Link href="/draft">Start your own draft</Link>
            </Button>
          }
        />
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Eye aria-hidden className="size-4" /> Read-only view
          {state.status !== "completed" &&
            ` · stopped after step ${state.turns.length} of ${sequence.length}`}
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
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
        <div className="grid gap-4 lg:grid-cols-2">
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
        kicker="Draft practice"
        title="Captain's Mode drafting"
        description="Draft against an AI captain, or practice both sides yourself. Every pick and ban is checked against the real Captain\u2019s Mode rules, and you can share any draft as a link."
      />
      <DraftBoard heroes={heroes} />
    </div>
  );
}
