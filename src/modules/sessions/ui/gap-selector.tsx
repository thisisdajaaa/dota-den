"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { GAP_OPTIONS, type GapMinutes } from "../domain/session";

/** How long a break has to be before the next game starts a new session. Saved per user. */
export function GapSelector({ value }: { value: GapMinutes }) {
  const router = useRouter();
  const [selected, setSelected] = useState<GapMinutes>(value);
  const [pending, startTransition] = useTransition();

  async function choose(gap: GapMinutes) {
    if (gap === selected || pending) return;
    const previous = selected;
    setSelected(gap);
    const res = await fetch("/api/v1/me/settings/session-gap", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gapMinutes: gap }),
    }).catch(() => null);
    if (!res?.ok) {
      setSelected(previous);
      toast.error("Couldn't change the break length. Please try again.");
      return;
    }
    // Back to the first page: page numbers change when sessions regroup.
    startTransition(() => {
      router.replace("/sessions", { scroll: false });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span id="gap-label" className="text-xs text-muted-foreground">
        New session after a break of more than
      </span>
      <div
        role="radiogroup"
        aria-labelledby="gap-label"
        aria-busy={pending}
        className="inline-flex rounded-lg border border-white/[0.07] bg-card/60 p-0.5"
      >
        {GAP_OPTIONS.map((g) => {
          const active = g === selected;
          return (
            <button
              key={g}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => void choose(g)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                active
                  ? "bg-gold/15 text-gold shadow-[inset_0_0_0_1px_oklch(0.8_0.13_80/0.3)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {g < 60 ? `${g} min` : `${g / 60} h`}
            </button>
          );
        })}
      </div>
    </div>
  );
}
