"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Tells the server the viewer's IANA time zone so calendars use local days. */
export function TimeZoneSync({ current }: { current: string | null }) {
  const router = useRouter();
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz || tz === current) return;
    document.cookie = `dd_tz=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }, [current, router]);
  return null;
}
