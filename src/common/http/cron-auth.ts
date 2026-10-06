import { createHash, timingSafeEqual } from "node:crypto";

const digest = (s: string): Buffer => createHash("sha256").update(s).digest();

/** Vercel Cron's bearer secret. Compares fixed-length digests so the check leaks no timing. */
export function isCronAuthorized(req: Request, secret: string): boolean {
  return timingSafeEqual(
    digest(req.headers.get("authorization") ?? ""),
    digest(`Bearer ${secret}`),
  );
}

/** Controller guard for Vercel Cron routes: 503 when cron isn't configured, 401 on a bad secret. */
export async function requireCron(req: Request): Promise<void> {
  const { env } = await import("@/common/config/env");
  const secret = env().CRON_SECRET;
  const { UnauthorizedError, UpstreamUnavailableError } = await import("@/common/errors/app-error");
  if (!secret) throw new UpstreamUnavailableError("Cron is not configured");
  if (!isCronAuthorized(req, secret)) throw new UnauthorizedError("Invalid cron credentials");
}
