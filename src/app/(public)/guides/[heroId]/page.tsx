import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { getT } from "@/common/i18n/server";
import { guideService } from "@/modules/guides";
import { isBuildFiller } from "@/modules/guides/domain/hero-guide";
import { Benchmarks, Counters, ItemBuilds, ProGames } from "@/modules/guides/ui/guide-sections";
import { SkillBuildCard, WardMap } from "@/modules/guides/ui/build-sections";
import { isWardKind, isWardPhase, isWardSide } from "@/modules/guides/domain/ward-spots";
import { matchesService } from "@/modules/matches";
import { HeroPortrait } from "@/modules/matches/ui/hero-portrait";

const HERO_ID = /^[1-9]\d{0,3}$/;

export async function generateMetadata({
  params,
}: PageProps<"/guides/[heroId]">): Promise<Metadata> {
  const { heroId } = await params;
  const t = await getT();
  const hero = HERO_ID.test(heroId)
    ? (await matchesService.heroMap()).get(Number(heroId))
    : undefined;
  return hero
    ? {
        title: t("guides.heroTitle", { name: hero.name }),
        description: t("guides.heroDescription", { name: hero.name }),
        alternates: { canonical: `/guides/${hero.id}` },
      }
    : { title: t("guides.heroFallbackTitle") };
}

export default async function HeroGuidePage({
  params,
  searchParams,
}: PageProps<"/guides/[heroId]">) {
  const { heroId: raw } = await params;
  const { pos, ws, wp, wk } = await searchParams;
  const position = typeof pos === "string" && /^[1-5]$/.test(pos) ? Number(pos) : undefined;
  if (!HERO_ID.test(raw)) notFound();
  const heroId = Number(raw);
  const t = await getT();
  const [heroes, items] = await Promise.all([matchesService.heroMap(), matchesService.itemMap()]);
  const hero = heroes.get(heroId);
  if (heroes.size > 0 && !hero) notFound();

  const isConsumable = (id: number) => items.get(id)?.qual === "consumable";
  const guide = await guideService.guide(heroId, isConsumable, {
    isFiller: (id) => isBuildFiller(items.get(id)),
    position,
    costOf: (id) => items.get(id)?.cost ?? null,
  });
  const name = hero?.name ?? t("guides.hero.fallbackName", { id: heroId });
  // Ward spots belong on support guides: the build is for pos 4/5, or the hero is a support.
  const supportBuild =
    guide.itemSource.source === "pubs"
      ? guide.itemSource.position >= 4
      : (hero?.roles ?? []).includes("Support");
  const wards = supportBuild ? await guideService.wardCells() : null;
  const wardView = {
    side: isWardSide(ws) ? ws : "radiant",
    phase: isWardPhase(wp) ? wp : "early",
    kind: isWardKind(wk) ? wk : "observer",
  } as const;
  const posParam = guide.itemSource.source === "pubs" ? `pos=${guide.itemSource.position}&` : "";

  return (
    <div className="space-y-6">
      <Link
        href="/guides"
        className="relative inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground touch:tap-area"
      >
        <ArrowLeft aria-hidden className="size-4" /> {t("guides.hero.back")}
      </Link>
      <div className="flex items-center gap-4">
        <HeroPortrait hero={hero} heroId={heroId} size="lg" />
        <PageHeader
          kicker={t("guides.hero.kicker")}
          title={name}
          description={hero?.roles.length ? hero.roles.join(" · ") : undefined}
        />
      </div>

      <ItemBuilds
        items={guide.items}
        build={guide.build}
        itemSource={guide.itemSource}
        itemMap={items}
        heroId={heroId}
        heroLabel={name}
      />
      <SkillBuildCard skills={guide.skills} heroLabel={name} />
      {supportBuild && (
        <WardMap
          data={wards}
          {...wardView}
          compact
          hrefFor={(v) =>
            `/guides/${heroId}?${posParam}ws=${v.side}&wp=${v.phase}&wk=${v.kind}#guide-wards`
          }
        />
      )}
      <Counters counters={guide.counters} heroes={heroes} heroLabel={name} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Benchmarks benchmarks={guide.benchmarks} />
        <ProGames games={guide.proGames} heroLabel={name} now={new Date()} />
      </div>
    </div>
  );
}
