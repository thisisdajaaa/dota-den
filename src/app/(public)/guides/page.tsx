import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { getHeroMap } from "@/modules/matches/composition";
import { HeroPicker } from "@/modules/guides/ui/hero-picker";

export const metadata: Metadata = {
  title: "Hero guides",
  description: "What pros buy on every hero, what strong games look like, and pro games to watch.",
};

const ATTRS = [
  { key: "str", label: "Strength" },
  { key: "agi", label: "Agility" },
  { key: "int", label: "Intelligence" },
  { key: "all", label: "Universal" },
] as const;

export default async function GuidesPage() {
  const heroes = [...(await getHeroMap()).values()].sort((a, b) => a.name.localeCompare(b.name));
  const groups = [
    ...ATTRS.map((a) => ({
      label: a.label,
      heroes: heroes.filter((h) => h.primaryAttr === a.key),
    })),
    { label: "Other", heroes: heroes.filter((h) => !ATTRS.some((a) => a.key === h.primaryAttr)) },
  ].filter((g) => g.heroes.length > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Guides"
        title="Hero guides"
        description="Pick a hero to see what pros buy in each phase, what strong games on it look like, and recent pro games to watch."
      />
      {heroes.length === 0 ? (
        <p className="panel p-5 text-sm text-muted-foreground">
          The hero list is unavailable right now. Try again in a minute.
        </p>
      ) : (
        <HeroPicker groups={groups} />
      )}
    </div>
  );
}
