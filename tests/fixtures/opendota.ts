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
