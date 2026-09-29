/** Dota players' own names for party sizes. */
export function partyName(size: number): string {
  return size === 2 ? "Duo" : size === 3 ? "Trio" : `${size}-stack`;
}

export function plural(n: number, word: string): string {
  const many = word.endsWith("s") ? `${word}es` : `${word}s`;
  return `${n.toLocaleString("en-US")} ${n === 1 ? word : many}`;
}

export function formatPercent(rate: number | null): string {
  return rate === null ? "—" : `${(rate * 100).toFixed(1)}%`;
}

export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatAgo(date: Date, now: Date): string {
  const mins = Math.round((now.getTime() - date.getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return months < 12 ? `${months}mo ago` : `${Math.round(months / 12)}y ago`;
}

export function queueLabel(
  queueClass: "solo" | "party" | "unknown",
  partySize: number | null,
): string {
  if (queueClass === "solo") return "Solo";
  if (queueClass === "party") return partySize ? partyName(partySize) : "Party";
  return "Unknown";
}

const GAME_MODES: Record<number, string> = {
  1: "All Pick",
  2: "Captains Mode",
  3: "Random Draft",
  4: "Single Draft",
  5: "All Random",
  12: "Least Played",
  16: "Captains Draft",
  18: "Ability Draft",
  22: "All Pick",
  23: "Turbo",
};

export function gameModeLabel(mode: number | null): string {
  return mode === null ? "Unknown mode" : (GAME_MODES[mode] ?? `Mode ${mode}`);
}

const REGIONS: Record<number, string> = {
  1: "US West",
  2: "US East",
  3: "Europe West",
  5: "SE Asia",
  6: "Dubai",
  7: "Australia",
  8: "Stockholm",
  9: "Austria",
  10: "Brazil",
  11: "South Africa",
  14: "Chile",
  15: "Peru",
  16: "India",
  19: "Japan",
  25: "Taiwan",
};

export function regionLabel(region: number | null): string | null {
  return region === null ? null : (REGIONS[region] ?? null);
}
