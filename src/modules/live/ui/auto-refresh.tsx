"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Stop refreshing a tab nobody has touched for this long (each refresh costs upstream calls). */
const IDLE_AFTER_MS = 15 * 60_000;

/**
 * Re-render the (server) page every `seconds` while the tab is visible and someone is around.
 * Keep `seconds` at or above the server's cache time, or every refresh misses the cache.
 */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    let lastActive = Date.now();
    const active = () => {
      lastActive = Date.now();
    };
    const events = ["pointerdown", "keydown", "scroll", "visibilitychange"] as const;
    for (const e of events) window.addEventListener(e, active, { passive: true });
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastActive > IDLE_AFTER_MS) return;
      router.refresh();
    }, seconds * 1000);
    return () => {
      clearInterval(id);
      for (const e of events) window.removeEventListener(e, active);
    };
  }, [router, seconds]);
  return null;
}
