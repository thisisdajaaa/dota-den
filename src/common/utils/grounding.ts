/**
 * Grounding check for AI-written text (pure): every number the model writes must be one of
 * the facts it was given. Shared by the match coach and the battle report's AI read, so both
 * follow one rule: the model writes the words, our data supplies the numbers.
 */

export type GroundUnit = "count" | "number" | "percent" | "seconds" | "clock" | "ratio" | "text";

/** One fact as the model saw it: its key, the label it was shown with, and its value. */
export interface GroundFact {
  key: string;
  label: string;
  value: number | string;
  unit: GroundUnit;
}

/** "12:34" (or "-1:20" before the horn). */
export function clock(sec: number): string {
  const sign = sec < 0 ? "-" : "";
  const s = Math.abs(Math.round(sec));
  return `${sign}${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const round = (n: number, digits = 0) => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

/**
 * Time markers the model may write without citing a fact: "minute 10", "min 10", "10 minutes",
 * "10 min", "first 10 minutes", "10-minute" (and Filipino/Cebuano "minuto"). Clock times like
 * "18:20" are not markers: they're stats (item timings, game length) and must match a fact.
 */
const MINUTE_WORD = "(?:minutes?|mins?|minutos?)";
const TIME_MARKERS = [
  new RegExp(`\\b(?:first|unang)\\s+\\d+(?:\\.\\d+)?\\s*${MINUTE_WORD}\\b`, "gi"),
  new RegExp(`\\b(?:minute|min|minuto)\\.?\\s+\\d+(?:\\.\\d+)?\\b`, "gi"),
  // "10 ka minuto" (Cebuano) and "10 na minuto" (Filipino) count too.
  new RegExp(`\\b\\d+(?:\\.\\d+)?\\s*(?:-\\s*|(?:ka|na)\\s+)?${MINUTE_WORD}\\b`, "gi"),
];
const CLOCK = /-?\b\d{1,3}:\d{2}\b/g;

/** The text with every time marker blanked out (they need no fact). */
function withoutTimeMarkers(text: string): string {
  return TIME_MARKERS.reduce((t, re) => t.replace(re, " "), text);
}

/** The text without the facts' keys: "goldAt10" quoted in a sentence isn't a 10. */
function withoutFactKeys(text: string, facts: readonly GroundFact[]): string {
  const keys = facts.map((f) => f.key).sort((a, b) => b.length - a.length);
  return keys.reduce((t, key) => t.split(key).join(" "), text);
}

/**
 * Clock times the facts have (item timings, game length), as the prompt writes them; the
 * minute marks stats are taken at ("10:00" when a key ends in "At10"); and the times in the
 * facts' labels ("Team fight deaths after 30:00").
 */
function allowedClocks(facts: readonly GroundFact[]): Set<string> {
  return new Set(
    facts.flatMap((f) => {
      const out: string[] = [...(f.label.match(CLOCK) ?? [])];
      const mark = /At(\d+)$/.exec(f.key);
      if (mark) out.push(`${Number(mark[1])}:00`);
      if (f.unit === "clock" && typeof f.value === "number") out.push(clock(f.value));
      return out;
    }),
  );
}

/** Every number a fact allows the text to contain. */
function allowedNumbers(facts: readonly GroundFact[]): Set<number> {
  const numbers = new Set<number>();
  for (const f of facts) {
    if (typeof f.value === "string") {
      for (const m of f.value.match(/\d+(?:\.\d+)?/g) ?? []) numbers.add(Number(m));
      continue;
    }
    const v = Math.abs(f.value);
    numbers.add(v);
    numbers.add(Math.round(v));
    numbers.add(round(v, 1));
    if (v >= 1000) {
      // "3.8k" style: thousands with one decimal. Not whole thousands: "4k" for 3,812 would
      // let a bare "4" through anywhere.
      numbers.add(round(v / 1000, 1));
    }
  }
  return numbers;
}

/**
 * Numbers in `text` that no fact backs (empty when the text is grounded). Minute markers are
 * skipped; a clock time must be one of the facts' clocks exactly; every other number must
 * equal a fact's value (as given, rounded, or in thousands with a "k").
 */
export function ungroundedIn(text: string, facts: readonly GroundFact[]): string[] {
  const numbers = allowedNumbers(facts);
  const clocks = allowedClocks(facts);
  const out: string[] = [];
  // Models often write "10‑minute" with a non-breaking hyphen (or a dash, or a minus sign).
  const plain = text.replace(/[‐-―−]/g, "-").replace(/(\d),(\d{3})/g, "$1$2");
  let cleaned = withoutTimeMarkers(withoutFactKeys(plain, facts));
  cleaned = cleaned.replace(CLOCK, (c) => {
    if (!clocks.has(c) && !clocks.has(c.replace(/^-/, ""))) out.push(c);
    return " ";
  });
  for (const m of cleaned.matchAll(/\d+(?:\.\d+)?/g)) {
    if (!numbers.has(Number(m[0]))) out.push(m[0]);
  }
  return [...new Set(out)];
}
