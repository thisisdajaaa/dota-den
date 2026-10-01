"use client";

import Link from "next/link";
import { useState } from "react";
import { SearchInput } from "@/components/search-input";
import type { HeroInfo } from "@/modules/matches/application/ports";
import { HeroPortrait } from "@/modules/matches/ui/hero-portrait";

/** Folds case and accents, and ignores spaces and punctuation ("anti mage" finds Anti-Mage). */
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/** Heroes grouped by attribute, filtered by name as you type. */
export function HeroPicker({ groups }: { groups: Array<{ label: string; heroes: HeroInfo[] }> }) {
  const [query, setQuery] = useState("");
  const q = fold(query);
  const shown = groups
    .map((g) => ({ ...g, heroes: q ? g.heroes.filter((h) => fold(h.name).includes(q)) : g.heroes }))
    .filter((g) => g.heroes.length > 0);

  return (
    <div className="space-y-6">
      <SearchInput
        value={query}
        onValueChange={setQuery}
        placeholder="Find a hero"
        aria-label="Find a hero"
        className="max-w-sm"
        inputClassName="h-10"
      />
      {shown.length === 0 ? (
        <p role="status" className="text-sm text-muted-foreground">
          No hero matches “{query}”.
        </p>
      ) : (
        shown.map((g) => (
          <section key={g.label} aria-labelledby={`attr-${g.label}`} className="space-y-3">
            <h2 id={`attr-${g.label}`} className="text-sm font-semibold text-muted-foreground">
              {g.label}
            </h2>
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
              {g.heroes.map((h) => (
                <li key={h.id}>
                  <Link
                    href={`/guides/${h.id}`}
                    className="group block rounded-lg p-1.5 text-center hover:bg-white/[0.04]"
                  >
                    <HeroPortrait
                      hero={h}
                      heroId={h.id}
                      size="md"
                      className="w-full"
                      displayWidth={140}
                    />
                    <span className="mt-1 block truncate text-xs group-hover:text-gold">
                      {h.name}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
