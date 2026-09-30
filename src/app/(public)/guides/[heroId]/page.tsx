import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { getGuideService } from "@/modules/guides/composition";
import { Benchmarks, ItemBuilds, ProGames } from "@/modules/guides/ui/guide-sections";
import { getHeroMap, getItemMap } from "@/modules/matches/composition";
import { HeroPortrait } from "@/modules/matches/ui/hero-portrait";

const HERO_ID = /^[1-9]\d{0,3}$/;

export async function generateMetadata({
  params,
}: PageProps<"/guides/[heroId]">): Promise<Metadata> {
  const { heroId } = await params;
  const hero = HERO_ID.test(heroId) ? (await getHeroMap()).get(Number(heroId)) : undefined;
  return hero
    ? {
        title: `${hero.name} guide`,
        description: `What pros buy on ${hero.name}, what strong games look like, and recent pro games.`,
      }
    : { title: "Hero guide" };
}

export default async function HeroGuidePage({ params }: PageProps<"/guides/[heroId]">) {
  const { heroId: raw } = await params;
  if (!HERO_ID.test(raw)) notFound();
  const heroId = Number(raw);
  const [heroes, items] = await Promise.all([getHeroMap(), getItemMap()]);
  const hero = heroes.get(heroId);
  if (heroes.size > 0 && !hero) notFound();

  const isConsumable = (id: number) => items.get(id)?.qual === "consumable";
  const guide = await getGuideService().guide(heroId, isConsumable);
  const name = hero?.name ?? `Hero #${heroId}`;

  return (
    <div className="space-y-6">
      <Link
        href="/guides"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden className="size-4" /> All heroes
      </Link>
      <div className="flex items-center gap-4">
        <HeroPortrait hero={hero} heroId={heroId} size="lg" />
        <PageHeader
          kicker="Hero guide"
          title={name}
          description={hero?.roles.length ? hero.roles.join(" · ") : undefined}
        />
      </div>

      <ItemBuilds items={guide.items} itemMap={items} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Benchmarks benchmarks={guide.benchmarks} />
        <ProGames games={guide.proGames} heroLabel={name} now={new Date()} />
      </div>
    </div>
  );
}
