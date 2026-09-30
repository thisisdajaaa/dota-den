import { ok, type Result } from "@/modules/shared/domain/result";
import type { MatchDetailProvider } from "@/modules/matches/application/ports";
import type { Seat } from "../domain/relation";
import type { MatchSeatReader, MatchSeats, ProviderError } from "../application/ports";

/** Seats from the matches context's match detail (party ids exactly as the upstream reports). */
export class MatchDetailSeatReader implements MatchSeatReader {
  constructor(private readonly details: Pick<MatchDetailProvider, "fetchMatch">) {}

  async seats(
    matchId: string,
    accountIds: readonly number[],
  ): Promise<Result<MatchSeats, ProviderError>> {
    const res = await this.details.fetchMatch(matchId);
    if (!res.ok) return res;
    const seats = new Map<number, Seat | null>();
    for (const id of accountIds) {
      // More than one row for an account would be corrupt; don't guess which seat is real.
      const rows = res.value.players.filter((p) => p.accountId32 === id);
      const p = rows.length === 1 ? rows[0] : null;
      seats.set(
        id,
        p ? { side: p.side, heroId: p.heroId, partyId: p.partyId, partySize: p.partySize } : null,
      );
    }
    return ok({ startedAt: res.value.startedAt, radiantWin: res.value.radiantWin, seats });
  }
}
