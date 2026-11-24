import Link from "next/link";
import { CalendarHeart, ChevronRight } from "lucide-react";
import { getT } from "@/common/i18n/server";

/** December and early January on the overview: a way into the year in review. */
export async function YearReviewPrompt({ year }: { year: number }) {
  const t = await getT();
  return (
    <Link
      href={`/report/year?year=${year}`}
      className="panel group relative isolate flex items-center gap-4 overflow-hidden p-4 transition-colors hover:border-gold/40 sm:p-5"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 -left-10 -z-10 size-48 rounded-full bg-gold/15 blur-3xl"
      />
      <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-gold/15 text-gold">
        <CalendarHeart aria-hidden className="size-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-lg font-semibold tracking-wide group-hover:text-gold">
          {t("report.year.prompt.title", { year })}
        </span>
        <span className="block text-sm text-muted-foreground">{t("report.year.prompt.body")}</span>
      </span>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />
    </Link>
  );
}
