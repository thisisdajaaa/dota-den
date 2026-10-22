"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/**
 * This page's host name, for embeds (Twitch only plays inside pages it's told about with
 * `parent=`). Null during server rendering, so embeds render after hydration.
 */
export function useEmbedHost(): string | null {
  return useSyncExternalStore(
    noop,
    () => window.location.hostname,
    () => null,
  );
}

/** Whether a media query matches (false during server rendering). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
