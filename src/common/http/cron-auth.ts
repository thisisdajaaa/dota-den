import { createHash, timingSafeEqual } from "node:crypto";

const digest = (s: string): Buffer => createHash("sha256").update(s).digest();

/** Vercel Cron's bearer secret. Compares fixed-length digests so the check leaks no timing. */
export function isCronAuthorized(req: Request, secret: string): boolean {
  return timingSafeEqual(
    digest(req.headers.get("authorization") ?? ""),
    digest(`Bearer ${secret}`),
  );
}
