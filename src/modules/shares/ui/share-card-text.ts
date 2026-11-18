import { plural, type Translator } from "@/common/i18n/translate";
import type { Messages } from "@/common/i18n/messages";
import { parseRankTier } from "@/modules/matches/domain/rank-tier";
import { rankLabel } from "@/modules/matches/ui/rank-medal";
import { formatDuration } from "@/modules/matches/ui/format";
import { winRate, type ShareSnapshot } from "../domain/share";
import {
  cardMoment,
  cardTone,
  compactNumber,
  kdaRatio,
  type CardMoment,
} from "../domain/share-card";

export interface CardStat {
  label: string;
  value: string;
  tone?: "win" | "loss" | "gold";
}

/** Everything a share card says, in one language. */
export interface CardText {
  moment: CardMoment;
  tone: "win" | "loss" | "gold";
  kicker: string;
  headline: string;
  sub: string | null;
  stats: CardStat[];
  footer: string;
  /** For og:title: the player's name and the headline (a streak gets its fire). */
  title: string;
}

const medalName = (tier: number) => {
  const r = parseRankTier(tier);
  return r ? rankLabel(r) : String(tier);
};

const percent = (r: number | null) => (r === null ? "—" : `${Math.round(r * 100)}%`);

/**
 * A card's words for a snapshot in the translator's language. `heroName` resolves hero ids
 * (the catalog lives outside the snapshot). Numbers are the snapshot's own, never estimated.
 */
export function shareCardText(
  t: Translator<Messages>,
  s: ShareSnapshot,
  opts: { playerName: string | null; heroName: (heroId: number) => string },
): CardText {
  const moment = cardMoment(s);
  const record = t("shares.record", { wins: s.wins, losses: s.losses });
  const kicker = t(`shares.card.kicker.${s.kind}`);
  const stats: CardStat[] = [];
  let headline: string;
  let sub: string | null = null;

  switch (s.kind) {
    case "streak": {
      const tier = moment.kind === "streak" ? moment.tier : "roll";
      headline = t(`shares.card.headline.streak.${tier}`, { n: s.games });
      sub = t("shares.card.sub.streak", { kills: s.kills, deaths: s.deaths, assists: s.assists });
      stats.push(
        { label: t("shares.card.stat.games"), value: String(s.games), tone: "win" },
        { label: t("shares.card.stat.kda"), value: kdaRatio(s).toFixed(1) },
      );
      break;
    }
    case "session":
    case "week": {
      const tier = moment.kind === s.kind ? moment.tier : "even";
      headline = t(`shares.card.headline.${s.kind}.${tier}`, { wins: s.wins, losses: s.losses });
      if (s.kind === "session" && s.best)
        sub = t("shares.card.sub.sessionBest", {
          hero: opts.heroName(s.best.heroId),
          kills: s.best.kills,
          deaths: s.best.deaths,
          assists: s.best.assists,
        });
      if (s.kind === "week" && s.best)
        sub = t("shares.card.sub.weekBest", {
          hero: opts.heroName(s.best.heroId),
          record: t("shares.record", { wins: s.best.wins, losses: s.best.games - s.best.wins }),
        });
      stats.push(
        { label: t("shares.card.stat.games"), value: String(s.games) },
        {
          label: t("shares.card.stat.winRate"),
          value: percent(winRate(s)),
          tone: cardTone(moment),
        },
      );
      break;
    }
    case "match": {
      const standout = moment.kind === "match" ? moment.standout : "none";
      const hero = opts.heroName(s.heroId);
      const kda = kdaRatio(s).toFixed(1);
      headline =
        standout === "none"
          ? t(`shares.card.headline.match.${s.result}`, { hero })
          : t(`shares.card.headline.match.${standout}`, {
              hero,
              kills: s.kills,
              kda,
              damage: s.heroDamage === null ? "" : compactNumber(s.heroDamage),
              gpm: s.goldPerMin ?? "",
            });
      sub = t("shares.card.sub.match", {
        result: t(`shares.match.${s.result}`),
        kills: s.kills,
        deaths: s.deaths,
        assists: s.assists,
        duration: formatDuration(s.durationSec),
      });
      stats.push({ label: t("shares.card.stat.kda"), value: kda, tone: cardTone(moment) });
      if (s.heroDamage !== null)
        stats.push({ label: t("shares.card.stat.heroDamage"), value: compactNumber(s.heroDamage) });
      if (s.goldPerMin !== null)
        stats.push({ label: t("shares.card.stat.gpm"), value: String(s.goldPerMin) });
      else if (s.lastHits !== null)
        stats.push({ label: t("shares.card.stat.lastHits"), value: String(s.lastHits) });
      break;
    }
    case "journey": {
      const first = s.medals[0];
      const last = s.medals.at(-1);
      const to = last ? medalName(last.rankTier) : "—";
      headline = t(
        s.climb ? "shares.card.headline.journey.climbed" : "shares.card.headline.journey.steady",
        { to: s.climb ? medalName(s.climb.toTier) : to },
      );
      if (first && last && first.rankTier !== last.rankTier)
        sub = t("shares.card.sub.journey", { from: medalName(first.rankTier), to });
      if (s.peak)
        stats.push({
          label: t("shares.card.stat.peak"),
          value: medalName(s.peak.rankTier),
          tone: "gold",
        });
      if (s.climb)
        stats.push({
          label: t("shares.card.stat.climb"),
          value: `+${plural(t, "shares.journey.stars", s.climb.steps)}`,
          tone: "win",
        });
      if (s.games > 0) stats.push({ label: t("shares.card.stat.ranked"), value: record });
      break;
    }
  }

  const who = opts.playerName ?? t("shares.aPlayer");
  return {
    moment,
    tone: cardTone(moment),
    kicker,
    headline,
    sub,
    stats: stats.slice(0, 3),
    footer: t("shares.card.footer"),
    title: `${who}: ${headline}${s.kind === "streak" ? " 🔥" : ""}`,
  };
}
