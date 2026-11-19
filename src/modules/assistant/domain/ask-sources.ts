/**
 * Where an answer's data came from (pure). Each tool reports its own sources from the data it
 * actually returned; the chips under an answer are these, never the model's claims.
 */
export type AskSource =
  | { kind: "your_games"; games: number }
  | { kind: "your_parsed_games"; games: number }
  | { kind: "your_match"; matchId: string }
  | { kind: "your_sessions" }
  | { kind: "your_mmr"; entries: number }
  /** STRATZ: a week of Legend–Immortal pub games. */
  | { kind: "high_rank_pubs" }
  | { kind: "pro_games"; games: number | null }
  /** OpenDota's public games in one rank bracket (bracket label, e.g. "Herald–Guardian"). */
  | { kind: "bracket_pubs"; bracket: string };

const id = (s: AskSource) =>
  s.kind === "your_match"
    ? `${s.kind}:${s.matchId}`
    : s.kind === "bracket_pubs"
      ? `${s.kind}:${s.bracket}`
      : s.kind;

/** One chip per source; for counted sources, the largest count seen. */
export function mergeSources(sources: readonly AskSource[]): AskSource[] {
  const out = new Map<string, AskSource>();
  for (const s of sources) {
    const prev = out.get(id(s));
    if (!prev) {
      out.set(id(s), s);
      continue;
    }
    if ("games" in prev && "games" in s && (s.games ?? 0) > (prev.games ?? 0)) out.set(id(s), s);
    if (prev.kind === "your_mmr" && s.kind === "your_mmr" && s.entries > prev.entries)
      out.set(id(s), s);
  }
  return [...out.values()].slice(0, 6);
}
