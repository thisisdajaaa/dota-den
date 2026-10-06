"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/common/i18n/client";
import { cn } from "cn";
import { SearchInput } from "@/components/search-input";
import type { DraftHero } from "./types";

const ATTRS = ["str", "agi", "int", "all"] as const;

/** In-game style hero picker, grouped by primary attribute, with search ("/" to focus). */
export function HeroGrid({
  heroes,
  unavailable,
  disabled,
  actionLabel,
  onChoose,
}: {
  heroes: DraftHero[];
  unavailable: Set<number>;
  disabled: boolean;
  actionLabel: string;
  onChoose: (heroId: number) => void;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const q = query.trim().toLowerCase();
  const matches = useMemo(
    () => heroes.filter((h) => !q || h.name.toLowerCase().includes(q)),
    [heroes, q],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const choosable = matches.filter((h) => !unavailable.has(h.id));

  return (
    <section className="panel space-y-4 p-4" aria-label={t("drafts.heroGrid.label")}>
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          ref={input}
          aria-label={t("drafts.heroGrid.search")}
          value={query}
          onValueChange={setQuery}
          onKeyDown={(e) => {
            if (e.key === "Enter" && choosable.length === 1 && !disabled) {
              onChoose(choosable[0].id);
              setQuery("");
            }
          }}
          placeholder={t("drafts.heroGrid.placeholder")}
          className="flex-1"
        />
        <span className="text-xs text-muted-foreground">
          {disabled
            ? t("drafts.heroGrid.startFirst")
            : t("drafts.heroGrid.clickTo", { action: actionLabel })}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        {ATTRS.map((attr) => {
          const group = matches.filter((h) => (h.primaryAttr ?? "all") === attr);
          if (group.length === 0) return null;
          return (
            <div key={attr}>
              <h3 className="mb-1.5 text-[0.65rem] font-semibold tracking-wider text-muted-foreground uppercase">
                {t(`drafts.heroGrid.attrs.${attr}`)}
              </h3>
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(3.4rem,1fr))] gap-1">
                {group.map((h) => {
                  const taken = unavailable.has(h.id);
                  return (
                    <li key={h.id}>
                      <button
                        type="button"
                        disabled={disabled || taken}
                        onClick={() => onChoose(h.id)}
                        title={
                          taken ? t("drafts.heroGrid.unavailableTitle", { hero: h.name }) : h.name
                        }
                        aria-label={
                          taken
                            ? t("drafts.heroGrid.unavailableLabel", { hero: h.name })
                            : t("drafts.heroGrid.choose", { action: actionLabel, hero: h.name })
                        }
                        className={cn(
                          "group relative block aspect-[16/9] w-full overflow-hidden rounded bg-muted ring-1 ring-white/[0.06] transition",
                          taken
                            ? "cursor-not-allowed opacity-25 grayscale"
                            : "hover:z-10 hover:scale-110 hover:ring-2 hover:ring-gold focus-visible:z-10 focus-visible:scale-110 focus-visible:ring-2 focus-visible:ring-gold",
                          disabled &&
                            !taken &&
                            "cursor-default hover:scale-100 hover:ring-white/[0.06]",
                        )}
                      >
                        {h.imageUrl ? (
                          <Image
                            src={h.imageUrl}
                            alt=""
                            width={64}
                            height={36}
                            className="absolute inset-0 size-full object-cover"
                          />
                        ) : (
                          <span className="grid h-full place-items-center p-0.5 text-[0.5rem] leading-tight">
                            {h.name}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
