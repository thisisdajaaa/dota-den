"use client";

import { Sparkles } from "lucide-react";
import { cn } from "cn";
import { useT } from "@/common/i18n/client";

/** The small gold "Plus" pill shown next to a supporter's name. */
export function PlusBadge({ className, size = "sm" }: { className?: string; size?: "sm" | "md" }) {
  const t = useT();
  return (
    <span
      title={t("plus.badge.title")}
      aria-label={t("plus.badge.title")}
      role="img"
      data-testid="plus-badge"
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full bg-gradient-to-r from-gold/25 to-gold/10 font-semibold text-gold ring-1 ring-gold/50",
        size === "sm" ? "px-1.5 py-0.5 text-[0.6rem]" : "px-2.5 py-1 text-xs",
        className,
      )}
    >
      <Sparkles aria-hidden className={size === "sm" ? "size-2.5" : "size-3.5"} />
      <span aria-hidden>{t("plus.badge.label")}</span>
    </span>
  );
}
