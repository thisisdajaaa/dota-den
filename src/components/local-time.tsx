"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** Renders a UTC timestamp in the viewer's time zone (server renders ISO as fallback). */
export function LocalTime({ iso }: { iso: string }) {
  const text = useSyncExternalStore(
    subscribe,
    () => new Date(iso).toLocaleString(),
    () => new Date(iso).toISOString().replace("T", " ").slice(0, 16) + " UTC",
  );
  return <time dateTime={iso}>{text}</time>;
}
