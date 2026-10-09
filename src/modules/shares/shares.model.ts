import type { ShareKind, ShareSnapshot } from "./domain/share";

export const SHARES_COLLECTION = "shares";

export interface ShareDocument {
  /** The public slug. */
  _id: string;
  userId: string;
  kind: ShareKind;
  /** What was shared: the session id, or the week's first day. One link per thing. */
  ref: string;
  /** The player's Steam name when they shared, shown on the page. */
  playerName: string | null;
  snapshot: ShareSnapshot;
  createdAt: Date;
  updatedAt: Date;
}
