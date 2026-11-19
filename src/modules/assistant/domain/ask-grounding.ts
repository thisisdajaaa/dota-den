import { ungroundedIn, type GroundFact } from "@/common/utils/grounding";

/**
 * Grounding for Ask Den (pure): every number in a reply must come from what our tools
 * returned for this question (or the player's own words, or an earlier checked answer). The
 * same rule as the match coach (`src/common/utils/grounding.ts`); only the facts differ: here
 * they are every value in the tool results, found by walking the JSON.
 */

const CLOCK_TEXT = /^-?\d{1,3}:\d{2}$/;

function clockSeconds(text: string): number {
  const negative = text.startsWith("-");
  const [m, s] = text.replace(/^-/, "").split(":").map(Number);
  const sec = m * 60 + s;
  return negative ? -sec : sec;
}

/**
 * Every value in a tool result as a fact (key = its JSON path). Numbers are facts as they
 * are; "mm:ss" strings are game clocks; other strings keep their digits (patch "7.39",
 * a date) so quoting them is allowed. Booleans and nulls carry no numbers.
 */
export function factsFromResult(result: unknown, prefix: string): GroundFact[] {
  const out: GroundFact[] = [];
  const walk = (v: unknown, path: string) => {
    if (typeof v === "number") {
      if (Number.isFinite(v)) out.push({ key: path, label: path, value: v, unit: "number" });
    } else if (typeof v === "string") {
      if (CLOCK_TEXT.test(v))
        out.push({ key: path, label: path, value: clockSeconds(v), unit: "clock" });
      else if (/\d/.test(v)) out.push({ key: path, label: path, value: v, unit: "text" });
    } else if (Array.isArray(v)) {
      v.forEach((x, i) => walk(x, `${path}.${i}`));
    } else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
    }
  };
  walk(result, prefix);
  return out;
}

/** Numbers written by the player (or in an earlier, already checked answer) may be repeated. */
export function factsFromText(text: string, key: string): GroundFact[] {
  return text.trim() ? [{ key, label: key, value: text, unit: "text" }] : [];
}

/**
 * Numbers in the reply that nothing backs (empty when it's grounded). Paths are stripped
 * from the text first by the shared checker, so a model quoting "games.0.kills" isn't a 0.
 */
export function ungroundedReply(reply: string, facts: readonly GroundFact[]): string[] {
  // Keys are JSON paths ("t1.games.0.kills"); they never appear in prose, and blanking them
  // (as the shared checker does) could blank a real number, so check against values only.
  return ungroundedIn(
    reply,
    facts.map((f) => ({ ...f, key: `\u0000${f.key}` })),
  );
}

/**
 * Items everyone carries: advice like "buy an Observer Ward" or "carry a Town Portal Scroll"
 * needs no data behind it.
 */
const ALWAYS_ALLOWED = new Set(
  [
    "Observer Ward",
    "Sentry Ward",
    "Observer and Sentry Wards",
    "Smoke of Deceit",
    "Dust of Appearance",
    "Town Portal Scroll",
    "Tango",
    "Healing Salve",
    "Clarity",
  ].map((n) => n.toLowerCase()),
);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const unify = (s: string) => s.replace(/[’‘]/g, "'").replace(/[‐-―]/g, "-");
const plain = (s: string) => unify(s).toLowerCase();

/**
 * Hero and item names the reply mentions that nothing this turn backs (empty when grounded):
 * the model may only name heroes and items that a tool returned, or that the player (or an
 * earlier checked answer) named. Stops builds and counters "from memory" that look like ours.
 */
export function unbackedNames(
  reply: string,
  catalog: readonly string[],
  backing: readonly string[],
): string[] {
  const corpus = plain(backing.join("\n"));
  const out: string[] = [];
  // Longest first, and blank each match, so "Boots of Travel" isn't also read as "Boots".
  // Names are matched as the game capitalises them: "a tiny bit" isn't the hero Tiny.
  let rest = unify(reply);
  for (const name of [...new Set(catalog)].sort((a, b) => b.length - a.length)) {
    const n = plain(name);
    if (n.length < 3) continue;
    const re = new RegExp(
      `(?<![\\p{L}\\p{N}])${escape(unify(name))}(?:s|'s)?(?![\\p{L}\\p{N}])`,
      "gu",
    );
    if (!re.test(rest)) continue;
    rest = rest.replace(re, " ");
    if (ALWAYS_ALLOWED.has(n) || corpus.includes(n)) continue;
    out.push(name);
  }
  return out;
}
