import { z } from "zod";

/** Filters for the match list. Parsed from untrusted URL params; invalid values fall back. */
export const MatchListFilterSchema = z.object({
  range: z.enum(["all", "patch", "30d"]).catch("all"),
  mode: z.enum(["all", "ranked"]).catch("all"),
  queue: z.enum(["all", "solo", "party", "unknown"]).catch("all"),
  result: z.enum(["all", "win", "loss"]).catch("all"),
  hero: z.coerce.number().int().min(1).max(1000).optional().catch(undefined),
  /** One of your match tags (normalized: lower case letters, digits, spaces, dashes). */
  tag: z
    .string()
    .regex(/^[\p{L}\p{N} -]{1,20}$/u)
    .optional()
    .catch(undefined),
  cursor: z
    .string()
    .regex(/^\d{10,15}_\d{1,20}$/)
    .optional()
    .catch(undefined),
});

export type MatchListFilter = z.infer<typeof MatchListFilterSchema>;

export function parseMatchListFilter(
  params: Record<string, string | string[] | undefined>,
): MatchListFilter {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  return MatchListFilterSchema.parse({
    range: first(params.range),
    mode: first(params.mode),
    queue: first(params.queue),
    result: first(params.result),
    hero: first(params.hero),
    tag: first(params.tag),
    cursor: first(params.cursor),
  });
}

/** Serialize a filter back to a query string, omitting defaults. */
export function matchListHref(filter: Partial<MatchListFilter>, base = "/matches"): string {
  const params = new URLSearchParams();
  if (filter.range && filter.range !== "all") params.set("range", filter.range);
  if (filter.mode && filter.mode !== "all") params.set("mode", filter.mode);
  if (filter.queue && filter.queue !== "all") params.set("queue", filter.queue);
  if (filter.result && filter.result !== "all") params.set("result", filter.result);
  if (filter.hero) params.set("hero", String(filter.hero));
  if (filter.tag) params.set("tag", filter.tag);
  if (filter.cursor) params.set("cursor", filter.cursor);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export function encodeCursor(startedAt: Date, matchId: string): string {
  return `${startedAt.getTime()}_${matchId}`;
}

export function decodeCursor(cursor: string): { startedAt: Date; matchId: string } | null {
  const [ms, matchId] = cursor.split("_");
  const t = Number(ms);
  return Number.isFinite(t) && matchId ? { startedAt: new Date(t), matchId } : null;
}
