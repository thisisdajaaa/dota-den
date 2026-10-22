import { type LiveGame } from "../../domain/live-game";
import { type SearchLink, type StreamMatch } from "../../domain/watch";

export interface WatchOptions {
  /** Streams whose titles mention this game; null when stream lookup isn't configured or failed. */
  streams: StreamMatch[] | null;
  links: SearchLink[];
}

export interface LiveOverview {
  /** League games someone is streaming. */
  league: LiveGame[];
  /** Top public games someone is streaming. */
  topPublic: LiveGame[];
  /** False when no streaming site answered, so watchable games couldn't be found. */
  streamsKnown: boolean;
}
