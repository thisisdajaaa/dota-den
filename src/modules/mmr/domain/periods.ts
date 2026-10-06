import { addDays, weekday, type DayKey } from "@/common/time/day-key";

export type CalendarView = "week" | "month" | "year" | "all";

export interface Period {
  view: CalendarView;
  from: DayKey;
  to: DayKey;
  /** Anchors for previous/next navigation (null when not applicable). */
  prev: DayKey | null;
  next: DayKey | null;
}

const MONTH = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDayKey(v: string | undefined): v is DayKey {
  if (!v) return false;
  const m = MONTH.exec(v);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === mo - 1 &&
    date.getUTCDate() === d &&
    y >= 2013 &&
    y <= 2100
  );
}

function lastDayOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** The calendar period containing `anchor` for a view; `earliest` bounds the all-time view. */
export function periodFor(
  view: CalendarView,
  anchor: DayKey,
  today: DayKey,
  earliest: DayKey | null,
): Period {
  const [y, m] = anchor.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  switch (view) {
    case "week": {
      const from = addDays(anchor, -weekday(anchor));
      return { view, from, to: addDays(from, 6), prev: addDays(from, -7), next: addDays(from, 7) };
    }
    case "month": {
      const from = `${y}-${pad(m)}-01`;
      const to = `${y}-${pad(m)}-${pad(lastDayOfMonth(y, m))}`;
      const prevM = m === 1 ? `${y - 1}-12-01` : `${y}-${pad(m - 1)}-01`;
      const nextM = m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`;
      return { view, from, to, prev: prevM, next: nextM };
    }
    case "year":
      return {
        view,
        from: `${y}-01-01`,
        to: `${y}-12-31`,
        prev: `${y - 1}-01-01`,
        next: `${y + 1}-01-01`,
      };
    case "all": {
      const from = earliest && earliest < today ? earliest : today;
      return { view, from, to: today, prev: null, next: null };
    }
  }
}
