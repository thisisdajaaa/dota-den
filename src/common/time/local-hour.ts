/** The local hour (0–23) of `date` in `timeZone` (UTC for an unknown zone). */
export function localHour(date: Date, timeZone: string): number {
  const fmt = (tz: string) =>
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" });
  let f: Intl.DateTimeFormat;
  try {
    f = fmt(timeZone);
  } catch {
    f = fmt("UTC");
  }
  const h = Number(f.formatToParts(date).find((p) => p.type === "hour")?.value);
  return Number.isFinite(h) ? h % 24 : date.getUTCHours();
}
