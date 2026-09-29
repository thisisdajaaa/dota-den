/** Synthetic OpenDota-shaped rows. Not real player data. */
export const PATCH_CONSTANTS = [
  { name: "7.40", date: "2025-12-16T00:50:40.281Z", id: 59 },
  { name: "7.41", date: "2026-03-24T00:50:59.580Z", id: 60 },
];

let nextId = 9_000_000_000;

export function matchRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    match_id: nextId++,
    player_slot: 0,
    radiant_win: true,
    duration: 2400,
    game_mode: 22,
    lobby_type: 7,
    hero_id: 14,
    start_time: Date.parse("2026-05-01T18:00:00Z") / 1000,
    version: null,
    kills: 5,
    deaths: 3,
    assists: 10,
    average_rank: 55,
    party_size: 1,
    ...overrides,
  };
}

/** Synthetic /search row (shape verified against the live API; not a real player). */
export function searchRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    account_id: 31_337,
    personaname: "Synthetic Searcher",
    avatarfull: "https://avatars.steamstatic.com/0123456789abcdef_full.jpg",
    last_match_time: "2026-09-27T12:00:00.000Z",
    similarity: 12.5,
    ...overrides,
  };
}

/** Synthetic /players/{id}/peers row. */
export function peerRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    account_id: 40_001,
    last_played: Date.parse("2026-09-28T12:00:00Z") / 1000,
    win: 30,
    games: 60,
    with_win: 28,
    with_games: 54,
    against_win: 2,
    against_games: 6,
    with_gpm_sum: 0,
    with_xpm_sum: 0,
    personaname: "Synthetic Teammate",
    name: null,
    is_contributor: false,
    is_subscriber: false,
    last_login: null,
    avatar: null,
    avatarfull: "https://avatars.steamstatic.com/fedcba9876543210_full.jpg",
    ...overrides,
  };
}

/** Synthetic /players/{id}/heroes row. */
export function heroRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    hero_id: 14,
    last_played: Date.parse("2026-09-28T12:00:00Z") / 1000,
    games: 40,
    win: 22,
    with_games: 10,
    with_win: 5,
    against_games: 12,
    against_win: 6,
    ...overrides,
  };
}
