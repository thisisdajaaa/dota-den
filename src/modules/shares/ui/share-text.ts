import { plural, type Translator } from "@/common/i18n/translate";
import type { Messages } from "@/common/i18n/messages";
import { parseRankTier } from "@/modules/matches/domain/rank-tier";
import { rankLabel } from "@/modules/matches/ui/rank-medal";
import type { ShareSnapshot } from "../domain/share";

const medalName = (tier: number) => {
  const r = parseRankTier(tier);
  return r ? rankLabel(r) : String(tier);
};

/** The headline and subtitle of a shared session, week, streak, game or journey, in the viewer's language. */
export function shareHeadline(
  t: Translator<Messages>,
  s: ShareSnapshot,
  playerName: string | null,
  heroName: (heroId: number) => string = String,
) {
  const record = t("shares.record", { wins: s.wins, losses: s.losses });
  const who = playerName ?? t("shares.aPlayer");
  if (s.kind === "journey") {
    const first = s.medals[0];
    const last = s.medals.at(-1);
    return {
      title: t("shares.journey.title", { who }),
      games:
        first && last
          ? t("shares.journey.description", {
              from: medalName(first.rankTier),
              to: medalName(last.rankTier),
            })
          : plural(t, "shares.games", s.games),
    };
  }
  if (s.kind === "streak")
    return {
      title: t("shares.streak.title", { who, n: s.games }),
      games: plural(t, "shares.games", s.games),
    };
  if (s.kind === "match")
    return {
      title: t("shares.match.title", { who, hero: heroName(s.heroId) }),
      games: `${t(`shares.match.${s.result}`)} · ${s.kills}/${s.deaths}/${s.assists}`,
    };
  return {
    title:
      s.kind === "session"
        ? t("shares.session.title", { who, record })
        : t("shares.week.title", { who, record }),
    games: plural(t, "shares.games", s.games),
  };
}
