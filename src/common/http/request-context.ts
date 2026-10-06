import "server-only";
import { cookies } from "next/headers";
import { isValidTimeZone } from "@/common/time/day-key";

/** Set by the browser (see the app shell) so day boundaries follow the viewer's clock. */
export const TZ_COOKIE = "dd_tz";

/** The viewer's IANA time zone from the cookie; UTC until the browser has set it. */
export async function getViewerTimeZone(): Promise<{ timeZone: string; known: boolean }> {
  const tz = (await cookies()).get(TZ_COOKIE)?.value;
  return tz && isValidTimeZone(tz)
    ? { timeZone: tz, known: true }
    : { timeZone: "UTC", known: false };
}
