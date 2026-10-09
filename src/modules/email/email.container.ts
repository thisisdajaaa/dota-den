import "server-only";
import { createHash } from "node:crypto";
import { env } from "@/common/config/env";
import { getDb } from "@/common/db/mongo";
import { logger } from "@/common/logging/logger";
import { lazy } from "@/common/utils/lazy";
import { usersService } from "@/modules/identity";
import { matchesService } from "@/modules/matches";
import { mmrInsightsService } from "@/modules/mmr";
import { sessionService } from "@/modules/sessions";
import { EmailController } from "./email.controller";
import type { EmailLinks } from "./email.ports";
import { ResendEmailSender } from "./infrastructure/resend-email-sender";
import { EmailLogRepository } from "./repositories/email-log.repository";
import { EmailSubscriptionsRepository } from "./repositories/email-subscriptions.repository";
import { EmailDigestService } from "./services/email-digest.service";
import { EmailService } from "./services/email.service";

export const emailSubscriptionsRepository = new EmailSubscriptionsRepository(getDb);
export const emailLogRepository = new EmailLogRepository(getDb);

/** True when RESEND_API_KEY and EMAIL_FROM are set (env.ts requires both or neither). */
export function emailEnabled(): boolean {
  const { RESEND_API_KEY, EMAIL_FROM } = env();
  return Boolean(RESEND_API_KEY && EMAIL_FROM);
}

function sender(): ResendEmailSender | null {
  const { RESEND_API_KEY, EMAIL_FROM, RESEND_API_BASE_URL } = env();
  if (!RESEND_API_KEY || !EMAIL_FROM) return null;
  return new ResendEmailSender({
    apiKey: RESEND_API_KEY,
    from: EMAIL_FROM,
    baseUrl: RESEND_API_BASE_URL,
  });
}

/**
 * The key that signs links in emails: EMAIL_TOKEN_SECRET, else one derived from the Resend
 * key (so a fresh setup needs only the provider's two variables). Null when email is off.
 */
function tokenKey(): string | null {
  const { EMAIL_TOKEN_SECRET, RESEND_API_KEY } = env();
  if (!emailEnabled()) return null;
  if (EMAIL_TOKEN_SECRET) return EMAIL_TOKEN_SECRET;
  return createHash("sha256").update(`dota-den:email-links:${RESEND_API_KEY}`).digest("base64url");
}

const links: EmailLinks = {
  confirm: (token) => appLink("/email/confirm", token),
  unsubscribe: (token) => appLink("/email/unsubscribe", token),
  unsubscribeOneClick: (token) => appLink("/api/v1/email/unsubscribe", token),
  dashboard: () => appLink("/dashboard"),
  account: () => appLink("/account#email"),
};

function appLink(path: string, token?: string): string {
  const url = new URL(path, env().APP_URL);
  if (token) url.searchParams.set("token", token);
  return url.toString();
}

export const emailService = lazy(
  () =>
    new EmailService({
      subscriptions: emailSubscriptionsRepository,
      log: emailLogRepository,
      sender: sender(),
      tokenKey: tokenKey(),
      links,
      logger,
    }),
);

export const emailDigest = lazy(
  () =>
    new EmailDigestService({
      email: emailService,
      users: {
        byIds: async (ids) =>
          (await usersService.findByIds(ids)).map((u) => ({
            id: u.id,
            accountId32: u.accountId32,
            language: u.settings.language ?? null,
            timeZone: u.settings.timeZone,
          })),
      },
      weeks: {
        week: async (owner, timeZone, weekOf) => {
          const recap = await mmrInsightsService.weeklyRecap(owner, timeZone, { weekOf });
          return {
            from: recap.from,
            to: recap.to,
            games: recap.thisWeek.games,
            wins: recap.thisWeek.wins,
            losses: recap.thisWeek.losses,
            mmr: recap.mmr,
            mostPlayed: recap.mostPlayed,
            best: recap.best,
          };
        },
      },
      history: {
        rankedSessions: async (owner) =>
          (await sessionService.rankedSessions(owner)).map((s) => ({
            matches: s.matches.map((m) => ({
              startedAt: m.startedAt,
              result: m.result,
              heroId: m.heroId,
            })),
          })),
        tiltStats: async (owner) => (await sessionService.tilt(owner)).stats,
      },
      heroes: {
        names: async () =>
          new Map([...(await matchesService.heroMap())].map(([id, h]) => [id, h.name])),
      },
      links,
      logger,
    }),
);

export const emailController = new EmailController({ service: emailService });
