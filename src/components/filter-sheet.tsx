"use client";

import { useState, type ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { cn } from "cn";
import { useT } from "@/common/i18n/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * A page's filter controls: inline from the `sm` breakpoint up, and behind a single
 * "Filters" button that opens a bottom sheet on phones. The controls are the same
 * URL-driven links either way, so query params don't change. The sheet stays open
 * while filters are picked (each pick is a soft navigation), until "Done".
 */
export function FilterSheet({
  label,
  activeCount,
  className,
  children,
}: {
  /** Accessible name of the filter group. */
  label: string;
  /** Filters that differ from their defaults, shown on the phone button. */
  activeCount: number;
  /** Layout of the inline (desktop) row. */
  className?: string;
  children: ReactNode;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <div role="group" aria-label={label} className={cn("hidden sm:flex", className)}>
        {children}
      </div>
      <div className="sm:hidden">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="gap-2">
              <SlidersHorizontal aria-hidden />
              {t("common.filters.button")}
              {activeCount > 0 && (
                <span
                  aria-label={t("common.filters.activeCount", { count: activeCount })}
                  className="grid min-w-5 place-items-center rounded-full bg-gold/20 px-1.5 text-xs font-semibold text-gold tabular-nums"
                >
                  {activeCount}
                </span>
              )}
            </Button>
          </DialogTrigger>
          <DialogContent
            aria-describedby={undefined}
            className="top-auto bottom-0 max-h-[85dvh] max-w-full translate-y-0 overflow-y-auto rounded-b-none pb-[max(1rem,env(safe-area-inset-bottom))] data-open:zoom-in-100 data-open:slide-in-from-bottom-8"
          >
            <DialogHeader>
              <DialogTitle>{t("common.filters.title")}</DialogTitle>
            </DialogHeader>
            <div role="group" aria-label={label} className="flex flex-col items-start gap-3">
              {children}
            </div>
            <DialogClose asChild>
              <Button className="w-full">{t("common.filters.done")}</Button>
            </DialogClose>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
