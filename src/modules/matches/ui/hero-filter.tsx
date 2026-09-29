"use client";

import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Hero picker that navigates to the matching filter URL. */
export function HeroFilter({
  options,
  value,
  hrefFor,
}: {
  options: Array<{ heroId: number; name: string; games: number }>;
  value: number | undefined;
  /** Pre-built URLs keyed by hero id ("all" clears the filter). */
  hrefFor: Record<string, string>;
}) {
  const router = useRouter();
  return (
    <Select
      value={value ? String(value) : "all"}
      onValueChange={(v) => router.push(hrefFor[v] ?? hrefFor.all, { scroll: false })}
    >
      <SelectTrigger
        size="sm"
        className="h-8 w-48 border-white/[0.07] bg-card/60 text-xs"
        aria-label="Hero"
      >
        <SelectValue placeholder="All heroes" />
      </SelectTrigger>
      <SelectContent className="max-h-80">
        <SelectItem value="all">All heroes</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.heroId} value={String(o.heroId)}>
            {o.name} <span className="text-muted-foreground">· {o.games}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
