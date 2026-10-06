import { type LiveGame } from "../../domain/live-game";
import { type SearchLink, type StreamMatch } from "../../domain/watch";

export interface WatchOptions {
  /** Streams whose titles mention this game; null when stream lookup isn't configured or failed. */
  streams: StreamMatch[] | null;
  links: SearchLink[];
}

export interface LiveOverview {
  league: LiveGame[];
  topPublic: LiveGame[];
}
