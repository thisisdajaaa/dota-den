/**
 * Solo / party / unknown classification (spec §2.1, §6).
 * Pure policy: missing or untrustworthy data is always `unknown`, never solo.
 */
export type QueueClass = "solo" | "party" | "unknown";

export type ClassificationReason =
  | "party_size_reported"
  | "party_size_missing"
  | "party_size_out_of_range"
  | "non_matchmaking_lobby"
  | "lobby_type_missing";

export interface QueueClassification {
  queueClass: QueueClass;
  partySize: number | null;
  /** How far the label can be trusted. `none` for unknown. */
  confidence: "high" | "none";
  reason: ClassificationReason;
}

/**
 * Lobby types where `party_size` reflects a matchmaking party.
 * 0 normal, 5 ranked team (legacy), 6 ranked solo (legacy), 7 ranked.
 * Practice/tournament lobbies report whole-lobby sizes (e.g. 10), so they are excluded.
 */
export const MATCHMAKING_LOBBY_TYPES: ReadonlySet<number> = new Set([0, 5, 6, 7]);
export const MAX_PARTY_SIZE = 5;

export function classifyQueue(input: {
  lobbyType: number | null | undefined;
  partySize: number | null | undefined;
}): QueueClassification {
  const { lobbyType, partySize } = input;
  const unknown = (reason: ClassificationReason): QueueClassification => ({
    queueClass: "unknown",
    partySize: null,
    confidence: "none",
    reason,
  });

  if (lobbyType === null || lobbyType === undefined) return unknown("lobby_type_missing");
  if (!MATCHMAKING_LOBBY_TYPES.has(lobbyType)) return unknown("non_matchmaking_lobby");
  if (partySize === null || partySize === undefined) return unknown("party_size_missing");
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > MAX_PARTY_SIZE) {
    return unknown("party_size_out_of_range");
  }
  return {
    queueClass: partySize === 1 ? "solo" : "party",
    partySize,
    confidence: "high",
    reason: "party_size_reported",
  };
}

export const RANKED_LOBBY_TYPES: ReadonlySet<number> = new Set([5, 6, 7]);

export function isRanked(lobbyType: number | null | undefined): boolean {
  return lobbyType !== null && lobbyType !== undefined && RANKED_LOBBY_TYPES.has(lobbyType);
}
