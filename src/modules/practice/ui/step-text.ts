import type { Messages } from "@/common/i18n/messages";
import type { Translator } from "@/common/i18n/translate";
import type { PlanGap, PlanStep, StepStatus } from "../domain/practice-plan";

type T = Translator<Messages>;
const pct = (rate: number) => Math.round(rate * 100);

/** A step in words, e.g. "Play Lion in 3 ranked games". */
export function stepLabel(
  t: T,
  step: PlanStep,
  heroName: (id: number) => string,
  timeZone: string,
): string {
  switch (step.kind) {
    case "practiceHero":
      return t("practice.step.practiceHero", { hero: heroName(step.heroId), target: step.target });
    case "stopAfterLosses":
      return t("practice.step.stopAfterLosses", { streak: step.streak });
    case "reviewLoss":
      return t("practice.step.reviewLoss", {
        hero: heroName(step.heroId),
        date: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone }).format(
          step.startedAt,
        ),
      });
    case "logMmr":
      return t("practice.step.logMmr");
  }
}

/** Why the step is in the plan, from the player's own numbers. */
export function stepWhy(t: T, step: PlanStep, heroName: (id: number) => string): string {
  switch (step.kind) {
    case "practiceHero": {
      const r = step.reason;
      const base = r.highRank
        ? t("practice.why.highRank", {
            rate: pct(r.highRank.rate),
            position: r.position,
            games: r.highRank.games.toLocaleString("en-US"),
          })
        : r.contestRate !== null
          ? t("practice.why.contest", { rate: pct(r.contestRate) })
          : t("practice.why.metaList", { position: r.position });
      return r.counter
        ? `${base} ${t("practice.why.counter", {
            nemesis: heroName(r.counter.nemesisId),
            loss: pct(r.counter.yourLossRate),
            games: r.counter.yourGames,
          })}`
        : base;
    }
    case "stopAfterLosses":
      return t("practice.why.stopAfterLosses", {
        streak: step.streak,
        after: pct(step.reason.after.rate),
        afterGames: step.reason.after.games,
        baseline: pct(step.reason.baseline.rate),
        baselineGames: step.reason.baseline.games.toLocaleString("en-US"),
      });
    case "reviewLoss":
      return t("practice.why.reviewLoss", step.reason);
    case "logMmr":
      return step.reason ? t("practice.why.logMmr", step.reason) : t("practice.why.logMmrBasic");
  }
}

/** Where a step stands this week, e.g. "1 / 3 games". */
export function stepStatusText(t: T, status: StepStatus, step: PlanStep): string {
  switch (status.kind) {
    case "heroGames":
      return t("practice.progress.heroGames", { played: status.played, target: status.target });
    case "streakRule":
      return status.broken === 0
        ? t("practice.progress.kept", { sessions: status.sessions })
        : t("practice.progress.broken", {
            streak: step.kind === "stopAfterLosses" ? step.streak : 2,
            broken: status.broken,
            sessions: status.sessions,
          });
    case "noSessions":
      return t("practice.progress.noSessions");
    case "reviewed":
      return t("practice.progress.reviewed");
    case "notReviewed":
      return t("practice.progress.notReviewed");
    case "sessionsLogged":
      return t("practice.progress.sessionsLogged", {
        logged: status.logged,
        total: status.total,
      });
  }
}

/** What more data would add to the plan. */
export function gapText(t: T, gap: PlanGap): string {
  switch (gap.kind) {
    case "tiltSample":
      return t("practice.gaps.tiltSample", { min: gap.min, games: gap.games });
    case "noRole":
      return t("practice.gaps.noRole");
    case "noHeroes":
      return t("practice.gaps.noHeroes");
  }
}
