import type { Messages } from "@/common/i18n/messages";
import type { Translator } from "@/common/i18n/translate";
import type { Goal, GoalStatus } from "../domain/goals";

/** A goal in words, e.g. "Win at least 52% of ranked games". Custom goals are the player's text. */
export function goalLabel(
  t: Translator<Messages>,
  goal: Goal,
  heroName: (id: number) => string,
): string {
  switch (goal.type) {
    case "winRate":
      return t("goals.describe.winRate", { target: goal.target });
    case "maxPerSession":
      return t("goals.describe.maxPerSession", { target: goal.target });
    case "logAfterSessions":
      return t("goals.describe.logAfterSessions");
    case "heroGames":
      return t("goals.describe.heroGames", { hero: heroName(goal.heroId), target: goal.target });
    case "custom":
      return goal.text;
  }
}

/** Where a goal stands, e.g. "3 / 4 sessions logged". */
export function goalStatusText(t: Translator<Messages>, status: GoalStatus): string {
  switch (status.kind) {
    case "needGames":
      return t("goals.progress.needGames", { games: status.games, min: status.min });
    case "winRate":
      return t("goals.progress.winRate", {
        rate: status.rate,
        wins: status.wins,
        losses: status.losses,
      });
    case "longestSession":
      return t("goals.progress.longestSession", { games: status.games });
    case "noSessions":
      return t("goals.progress.noSessions");
    case "sessionsLogged":
      return t("goals.progress.sessionsLogged", { logged: status.logged, total: status.total });
    case "heroGames":
      return t("goals.progress.heroGames", { played: status.played, target: status.target });
    case "done":
      return t("goals.progress.done");
    case "notYet":
      return t("goals.progress.notYet");
  }
}
