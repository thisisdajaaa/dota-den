import { dayKeyFormatter } from "@/common/time/day-key";
import { reviewYears, yearReview, type YearGame, type YearReview } from "../domain/year-review";

const DAY_MS = 24 * 3_600_000;

/** Your imported games (our database, no OpenDota calls). */
export interface YearGamesSource {
  games(accountId32: number, range: { from: Date; to: Date }): Promise<YearGame[]>;
  firstStartedAt(accountId32: number): Promise<Date | null>;
}

export interface YearReviewView {
  review: YearReview;
  /** Years that can be opened, newest first. */
  years: number[];
  /** Whether the year is still going (its numbers will change). */
  ongoing: boolean;
}

/**
 * Your year in Dota, from the games our match sync imported: free, and read only from our
 * database, so opening it costs no OpenDota calls.
 */
export class YearReviewService {
  constructor(private readonly deps: { games: YearGamesSource; now?: () => Date }) {}

  /** The years a player can open (this year first). */
  async years(accountId32: number, timeZone: string): Promise<number[]> {
    const dayKey = dayKeyFormatter(timeZone);
    const now = this.deps.now?.() ?? new Date();
    return reviewYears(await this.deps.games.firstStartedAt(accountId32), dayKey(now), dayKey);
  }

  /** One year; the newest year when `year` isn't one the player can open. */
  async review(
    accountId32: number,
    year: number | null,
    timeZone: string,
  ): Promise<YearReviewView> {
    const dayKey = dayKeyFormatter(timeZone);
    const now = this.deps.now?.() ?? new Date();
    const years = await this.years(accountId32, timeZone);
    const chosen = year !== null && years.includes(year) ? year : years[0]!;
    // A day either side covers every time zone; the domain keeps the local year only.
    const from = new Date(Date.UTC(chosen, 0, 1) - DAY_MS);
    const to = new Date(Math.min(Date.UTC(chosen + 1, 0, 1) + DAY_MS, now.getTime()));
    const games = await this.deps.games.games(accountId32, { from, to });
    return {
      review: yearReview(games, { year: chosen, timeZone, dayKey }),
      years,
      ongoing: chosen === Number(dayKey(now).slice(0, 4)),
    };
  }
}
