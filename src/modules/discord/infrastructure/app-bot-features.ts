import "server-only";
import { AppError } from "@/common/errors/app-error";
import type { Logger } from "@/common/logging/logger";
import type { AskAnswerDto } from "@/modules/assistant";
import type { PickForMeResult } from "@/modules/drafts";
import type { CoachResultDto } from "@/modules/matches";
import type { BotGame, BotLocale } from "../domain/bot";
import type { BotHero } from "../domain/hero-match";
import type {
  BotAskResult,
  BotCoachResult,
  BotFeatures,
  BotPickResult,
  BotUser,
} from "../discord.ports";

const reasonOf = (e: unknown): string | null => {
  if (!(e instanceof AppError)) return null;
  const d = e.details;
  return typeof d === "object" && d !== null && "reason" in d ? String(d.reason) : null;
};

/**
 * The bot's view of other features: the same services the site uses (so quotas, budgets and
 * grounding checks are shared), with their refusals turned into outcomes the bot can say.
 */
export class AppBotFeatures implements BotFeatures {
  constructor(
    private readonly deps: {
      games: (accountId32: number) => Promise<BotGame[]>;
      /** The newest imported match id, or null. */
      latestMatchId: (accountId32: number) => Promise<string | null>;
      heroes: () => Promise<BotHero[]>;
      userLanguage: (userId: string) => Promise<string | null>;
      setLanguage: (userId: string, locale: BotLocale) => Promise<void>;
      isPlus: (userId: string) => Promise<boolean>;
      coachEnabled: () => boolean;
      coachReview: (user: BotUser, matchId: string, locale: BotLocale) => Promise<CoachResultDto>;
      askEnabled: () => boolean;
      ask: (user: BotUser, question: string, locale: BotLocale) => Promise<AskAnswerDto>;
      pick: (
        user: BotUser,
        req: {
          enemies: number[];
          allies: number[];
          bans: number[];
          position: 1 | 2 | 3 | 4 | 5 | null;
        },
      ) => Promise<PickForMeResult>;
      logger: Pick<Logger, "warn">;
    },
  ) {}

  games(accountId32: number) {
    return this.deps.games(accountId32);
  }
  heroes() {
    return this.deps.heroes();
  }
  userLanguage(userId: string) {
    return this.deps.userLanguage(userId);
  }
  setLanguage(userId: string, locale: BotLocale) {
    return this.deps.setLanguage(userId, locale);
  }
  isPlus(userId: string) {
    return this.deps.isPlus(userId).catch(() => false);
  }

  async coach(user: BotUser, matchId: string | null, locale: BotLocale): Promise<BotCoachResult> {
    if (!this.deps.coachEnabled()) return { kind: "off" };
    const id = matchId ?? (await this.deps.latestMatchId(user.accountId32));
    if (!id) return { kind: "no_match" };
    try {
      const res = await this.deps.coachReview(user, id, locale);
      return {
        kind: "review",
        matchId: res.review.matchId,
        heroId: res.review.heroId,
        cached: res.cached,
        points: res.review.points.map((p) => ({
          kind: p.kind,
          title: p.title,
          detail: p.detail,
          facts: p.facts.map((f) => ({
            base: f.base,
            subject: f.subject,
            value: f.value,
            unit: f.unit,
          })),
        })),
      };
    } catch (e) {
      const reason = reasonOf(e);
      if (reason === "unparsed") return { kind: "unparsed", matchId: id };
      if (reason === "quota") return { kind: "quota" };
      if (reason === "resting") return { kind: "resting" };
      if (reason === "not_configured") return { kind: "off" };
      // Not their match (a typed id), not found, OpenDota down, or the checks failed twice.
      if (e instanceof AppError && (e.code === "not_found" || e.code === "forbidden"))
        return { kind: "no_match" };
      this.deps.logger.warn("discord_coach_failed", { error: e });
      return { kind: "failed" };
    }
  }

  async ask(user: BotUser, question: string, locale: BotLocale): Promise<BotAskResult> {
    if (!this.deps.askEnabled()) return { kind: "off" };
    try {
      const res = await this.deps.ask(user, question, locale);
      if (res.answer.fallback || !res.answer.text) return { kind: "fallback" };
      return {
        kind: "answer",
        text: res.answer.text,
        remaining: res.quota.remaining,
        limit: res.quota.limit,
      };
    } catch (e) {
      const reason = reasonOf(e);
      if (reason === "quota") {
        const d = (e as AppError).details as { quota?: { resetsAt?: string } };
        return { kind: "quota", resetsAt: d.quota?.resetsAt ?? "" };
      }
      if (reason === "resting") return { kind: "resting" };
      if (reason === "not_configured") return { kind: "off" };
      this.deps.logger.warn("discord_ask_failed", { error: e });
      return { kind: "failed" };
    }
  }

  async pick(
    user: BotUser,
    req: { enemies: number[]; allies: number[]; position: 1 | 2 | 3 | 4 | 5 | null },
  ): Promise<BotPickResult> {
    try {
      const res = await this.deps.pick(user, { ...req, bans: [] });
      return {
        kind: "ok",
        poolSize: res.poolSize,
        highRank: res.sources.highRank,
        suggestions: res.suggestions.map((s) => ({
          heroId: s.heroId,
          you: { games: s.you.games, wins: s.you.wins },
          counters: s.counters,
          allies: s.allies,
        })),
      };
    } catch (error) {
      this.deps.logger.warn("discord_pick_failed", { error });
      return { kind: "failed" };
    }
  }
}
