import { z } from "zod";

/** Filters for matchups from your own games. Parsed from untrusted URL params; invalid values fall back. */
export const MatchupsFilterSchema = z.object({
  range: z.enum(["all", "patch", "90d", "30d"]).catch("all"),
  mode: z.enum(["all", "ranked"]).catch("all"),
  /** Only games where you played this hero. */
  hero: z.coerce.number().int().min(1).max(1000).optional().catch(undefined),
});

export type MatchupsFilter = z.infer<typeof MatchupsFilterSchema>;

export function parseMatchupsFilter(
  params: Record<string, string | string[] | undefined>,
): MatchupsFilter {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  return MatchupsFilterSchema.parse({
    range: first(params.range),
    mode: first(params.mode),
    hero: first(params.hero),
  });
}

export const MATCHUPS_PATH = "/heroes/matchups";

/** The page's URL for a filter, omitting defaults. */
export function matchupsHref(filter: Partial<MatchupsFilter>): string {
  const params = new URLSearchParams();
  if (filter.range && filter.range !== "all") params.set("range", filter.range);
  if (filter.mode && filter.mode !== "all") params.set("mode", filter.mode);
  if (filter.hero) params.set("hero", String(filter.hero));
  const qs = params.toString();
  return qs ? `${MATCHUPS_PATH}?${qs}` : MATCHUPS_PATH;
}
