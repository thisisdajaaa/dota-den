import { plural, type Translator } from "@/common/i18n/translate";
import type { Messages } from "@/common/i18n/messages";
import type { ShareSnapshot } from "../domain/share";

/** The headline and subtitle of a shared session or week, in the viewer's language. */
export function shareHeadline(
  t: Translator<Messages>,
  s: ShareSnapshot,
  playerName: string | null,
) {
  const record = t("shares.record", { wins: s.wins, losses: s.losses });
  const who = playerName ?? t("shares.aPlayer");
  return {
    title:
      s.kind === "session"
        ? t("shares.session.title", { who, record })
        : t("shares.week.title", { who, record }),
    games: plural(t, "shares.games", s.games),
  };
}
