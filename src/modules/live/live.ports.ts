import { type LiveGame } from "./domain/live-game";
import { type LiveStream } from "./domain/watch";

/** Where live games come from. Null means the feed is unavailable right now. */
export interface LiveSource {
  games(): Promise<LiveGame[] | null>;
  leagueName(leagueId: number): Promise<string | null>;
}

/** Live Dota 2 streams. Null means the streaming site is unavailable right now. */
export interface StreamSource {
  dotaStreams(): Promise<LiveStream[] | null>;
}
