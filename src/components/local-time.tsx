"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** Date and time without seconds, e.g. "Oct 21, 2026, 8:30 PM". */
const FORMAT: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" };

/** Renders a UTC timestamp in the viewer's time zone (server renders ISO as fallback). */
export function LocalTime({ iso }: { iso: string }) {
  const text = useSyncExternalStore(
    subscribe,
    () => new Date(iso).toLocaleString(undefined, FORMAT),
    () => new Date(iso).toISOString().replace("T", " ").slice(0, 16) + " UTC",
  );
  return <time dateTime={iso}>{text}</time>;
}
