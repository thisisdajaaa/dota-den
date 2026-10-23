/**
 * Fixture OpenDota API for E2E runs. Synthetic data only; no real players.
 * Serves the handful of endpoints the app uses, shaped like the real API.
 */
import { createServer } from "node:http";

const PORT = Number(process.env.FIXTURE_PORT ?? 3101);
const ACCOUNT = 22202;
const DAY = 86_400;
const NOW = Math.floor(Date.now() / 1000);

const AM_PURCHASES = Object.fromEntries(
  [1, 2, 4, 5, 7, 8].map((i, n) => [
    i,
    {
      tango: 2,
      boots: 1,
      power_treads: 1,
      bfury: 1,
      ...(n < 4 ? { manta: 1 } : { black_king_bar: 1 }),
    },
  ]),
);

// 12 synthetic matches, newest first: 7 wins, 5 losses; 6 solo, 4 party, 2 unknown.
const MATCHES = Array.from({ length: 12 }, (_, i) => ({
  match_id: 7_000_000_000 + (12 - i),
  player_slot: i % 2 === 0 ? 1 : 129,
  radiant_win: i % 2 === 0 ? i % 4 !== 2 : i % 3 === 0,
  duration: 1800 + i * 60,
  game_mode: 22,
  lobby_type: 7,
  hero_id: i % 3 === 0 ? 14 : 1,
  start_time: NOW - (i + 1) * DAY,
  version: i === 0 ? 22 : null,
  kills: 5 + i,
  deaths: 3,
  assists: 10,
  average_rank: 55,
  party_size: i < 6 ? 1 : i < 10 ? 2 : null,
  // Parsed-replay lane info (1 safe, 2 mid, 3 off): Anti-Mage in the safe lane, Pudge off.
  lane_role: i % 3 === 0 ? 3 : 1,
  is_roaming: false,
  gold_per_min: 600 + i * 10,
  xp_per_min: 700 + i * 10,
  // Purchase log (parsed replays only): six Anti-Mage games. Battle Fury and Power Treads
  // every game, Manta in four, BKB in two; consumables and components are filtered out.
  purchase: AM_PURCHASES[i] ?? null,
}));
// Both lineups per match (the `heroes` projection: slot → hero), for draft grading and
// matchups from your own games: distinct fixture heroes, the player's own hero in their slot.
for (const m of MATCHES) {
  const slots = [0, 1, 2, 3, 4, 128, 129, 130, 131, 132];
  m.heroes = Object.fromEntries(
    slots.map((slot, k) => [
      String(slot),
      { hero_id: slot === m.player_slot ? m.hero_id : 100 + k },
    ]),
  );
}

// Hero coaching fixture (its own account, SteamID 76561197960466001): 20 parsed Anti-Mage
// games, newest first. Battle Fury every game; Manta in the 10 even ones, 8 of them won;
// 3 of the 10 without Manta won. Match details carry purchase logs and lanes.
const COACH = 200_273;
const COACH_MANTA_WINS = new Set([0, 2, 4, 8, 10, 12, 14, 16]);
const COACH_OTHER_WINS = new Set([1, 3, 5]);
const COACH_MATCHES = Array.from({ length: 20 }, (_, i) => {
  const manta = i % 2 === 0;
  const won = manta ? COACH_MANTA_WINS.has(i) : COACH_OTHER_WINS.has(i);
  return {
    match_id: 7_300_000_000 + (20 - i),
    player_slot: 0,
    radiant_win: won,
    duration: 2000 + i * 30,
    game_mode: 22,
    lobby_type: 7,
    hero_id: 1,
    start_time: NOW - (i + 1) * 6 * 3600,
    version: 22,
    kills: 8,
    deaths: 4,
    assists: 6,
    average_rank: 55,
    party_size: 1,
    lane_role: 1,
    is_roaming: false,
    gold_per_min: 620,
    xp_per_min: 700,
    purchase: { tango: 2, boots: 1, bfury: 1, ...(manta ? { manta: 1 } : {}) },
    heroes: Object.fromEntries(
      [0, 1, 2, 3, 4, 128, 129, 130, 131, 132].map((slot, k) => [
        String(slot),
        { hero_id: slot === 0 ? 1 : 100 + k },
      ]),
    ),
  };
});

/** A coaching game's detail: you safe lane (slot 0) with slot 3, against slots 130 and 132. */
function coachDetail(index) {
  const row = COACH_MATCHES[index];
  const won = row.radiant_win;
  const lanes = { 0: 1, 1: 2, 2: 3, 3: 1, 4: 3, 128: 3, 129: 2, 130: 1, 131: 3, 132: 1 };
  const players = [0, 1, 2, 3, 4, 128, 129, 130, 131, 132].map((slot, k) => {
    const me = slot === 0;
    // Gold per minute in lane: you win the lane in wins and lose it in losses.
    const perMin = me ? (won ? 450 : 250) : 330;
    return {
      player_slot: slot,
      account_id: me ? COACH : 91_000 + slot,
      personaname: me ? "Fixture Coachee" : `Fixture ${slot}`,
      hero_id: me ? 1 : 100 + k,
      level: 20,
      kills: 5,
      deaths: 5,
      assists: 5,
      last_hits: 150,
      denies: 10,
      gold_per_min: 500,
      xp_per_min: 600,
      lane: lanes[slot],
      lane_role: me ? 1 : lanes[slot] === 2 ? 2 : lanes[slot] === 1 ? 1 : 3,
      is_roaming: false,
      lane_efficiency_pct: me ? (won ? 80 : 55) : 60,
      lh_t: Array.from({ length: 31 }, (_, m) => m * 5),
      dn_t: Array.from({ length: 31 }, (_, m) => Math.floor(m / 2)),
      gold_t: Array.from({ length: 31 }, (_, m) => m * perMin),
      purchase_log: me
        ? [
            { time: -80, key: "tango" },
            { time: 200, key: "boots" },
            // Faster Battle Fury in wins: 13:00 in wins, 16:00 in losses (plus a few seconds).
            { time: (won ? 780 : 960) + index, key: "bfury" },
            ...(row.purchase.manta ? [{ time: (won ? 1500 : 1800) + index, key: "manta" }] : []),
          ]
        : [],
    };
  });
  return {
    match_id: row.match_id,
    start_time: row.start_time,
    duration: row.duration,
    radiant_win: row.radiant_win,
    radiant_score: 30,
    dire_score: 20,
    game_mode: 22,
    lobby_type: 7,
    region: 3,
    first_blood_time: 90,
    version: row.version,
    players,
  };
}

function player(slot, extra = {}) {
  return {
    player_slot: slot,
    account_id: 90_000 + slot,
    personaname: `Fixture ${slot}`,
    hero_id: slot < 128 ? 14 : 1,
    level: 20,
    kills: 5,
    deaths: 5,
    assists: 5,
    last_hits: 150,
    denies: 10,
    gold_per_min: 500,
    xp_per_min: 600,
    net_worth: 15_000,
    hero_damage: 20_000,
    tower_damage: 1_000,
    hero_healing: 0,
    item_0: 36,
    party_id: slot,
    party_size: 1,
    ...extra,
  };
}

// "Play together" fixture: shared matches between ACCOUNT and Fixture Peer (40001), by index
// into MATCHES. Party games carry a shared party id on the same team (matching their duo
// party_size above); one same-team game has no party data; one is on opposite teams.
const FRIEND = 40_001;
const SHARED = { party: [6, 7, 8, 9], sameTeamUnknown: [10], opponents: [2] };
const sharedIndices = [...SHARED.party, ...SHARED.sameTeamUnknown, ...SHARED.opponents];

/** Seats for ACCOUNT and FRIEND in match `i`, or null when the friend isn't in it. */
function sharedSeats(i, mySlot) {
  const teammateSlot = mySlot < 128 ? 2 : 130;
  const opponentSlot = mySlot < 128 ? 130 : 2;
  const friend = { account_id: FRIEND, personaname: "Fixture Peer", hero_id: 101 };
  if (SHARED.party.includes(i)) {
    const party = { party_id: 900 + i, party_size: 2 };
    return { me: party, friendSlot: teammateSlot, friend: { ...friend, ...party } };
  }
  if (SHARED.sameTeamUnknown.includes(i)) {
    const none = { party_id: null, party_size: null };
    return { me: none, friendSlot: teammateSlot, friend: { ...friend, ...none } };
  }
  if (SHARED.opponents.includes(i)) {
    return { me: {}, friendSlot: opponentSlot, friend: { ...friend, party_size: 1 } };
  }
  return null;
}

// Replay fields for parsed matches: lanes by slot, steady farm, a few purchases.
const LANES = { 0: 1, 1: 2, 2: 3, 3: 1, 4: 3, 128: 3, 129: 2, 130: 1, 131: 3, 132: 1 };
function laningFields(slot, me) {
  const perMin = me ? 5 : 4;
  return {
    lane: LANES[slot],
    lane_role: slot < 128 ? (LANES[slot] === 1 ? 1 : LANES[slot] === 2 ? 2 : 3) : 1,
    is_roaming: false,
    lane_efficiency_pct: me ? 74 : 60,
    lh_t: Array.from({ length: 31 }, (_, m) => m * perMin),
    dn_t: Array.from({ length: 31 }, (_, m) => Math.floor(m / 2)),
    gold_t: Array.from({ length: 31 }, (_, m) => m * (me ? 380 : 330)),
    obs_placed: me ? 2 : 0,
    sen_placed: 1,
    camps_stacked: 1,
    stuns: 12.5,
    teamfight_participation: 0.6,
    obs_log: me
      ? [
          { time: -30, x: 100, y: 90, ehandle: 1 },
          { time: 700, x: 128, y: 128, ehandle: 2 },
        ]
      : [],
    obs_left_log: me ? [{ time: 330, x: 100, y: 90, ehandle: 1 }] : [],
    sen_log: me ? [{ time: 300, x: 110, y: 95, ehandle: 3 }] : [],
    sen_left_log: [],
    purchase_log: me
      ? [
          { time: -80, key: "tango" },
          { time: 600, key: "power_treads" },
          { time: 1100, key: "bfury" },
        ]
      : [],
  };
}

// AI match coach fixture (its own account, SteamID 76561197960468001): three Anti-Mage games,
// newest first. The first two are parsed (laning, items, wards, team fights, benchmarks);
// the third isn't. Party size isn't recorded (unknown, never solo).
const COACH_AI = 202_273;
const COACH_AI_MATCHES = Array.from({ length: 3 }, (_, i) => ({
  match_id: 7_400_000_003 - i,
  player_slot: 0,
  radiant_win: i !== 1,
  duration: 2400 + i * 60,
  game_mode: 22,
  lobby_type: 7,
  hero_id: 1,
  start_time: NOW - (i + 1) * 3 * 3600,
  version: i < 2 ? 22 : null,
  kills: 9,
  deaths: 3,
  assists: 7,
  average_rank: 55,
  party_size: null,
  lane_role: 1,
  is_roaming: false,
  gold_per_min: 640,
  xp_per_min: 710,
  heroes: Object.fromEntries(
    [0, 1, 2, 3, 4, 128, 129, 130, 131, 132].map((slot, k) => [
      String(slot),
      { hero_id: slot === 0 ? 1 : 100 + k },
    ]),
  ),
}));

function coachAiDetail(index) {
  const row = COACH_AI_MATCHES[index];
  const parsed = row.version !== null;
  const players = [0, 1, 2, 3, 4, 128, 129, 130, 131, 132].map((slot, k) => {
    const me = slot === 0;
    const base = player(slot, {
      account_id: me ? COACH_AI : 92_000 + slot,
      personaname: me ? "Fixture Student" : `Fixture ${slot}`,
      hero_id: me ? 1 : 100 + k,
      kills: me ? row.kills : 5,
      deaths: me ? row.deaths : 5,
      assists: me ? row.assists : 5,
      gold_per_min: me ? row.gold_per_min : 500,
      xp_per_min: me ? row.xp_per_min : 600,
      party_id: null,
      party_size: null,
      ...(me
        ? {
            benchmarks: {
              gold_per_min: { raw: 640, pct: 0.81, pct_bracket: 0.7 },
              last_hits_per_min: { raw: 7.9, pct: 0.92, pct_bracket: 0.9 },
              tower_damage: { raw: 1000, pct: 0.24, pct_bracket: 0.2 },
            },
          }
        : {}),
    });
    return parsed ? { ...base, ...laningFields(slot, me) } : base;
  });
  return {
    match_id: row.match_id,
    start_time: row.start_time,
    duration: row.duration,
    radiant_win: row.radiant_win,
    radiant_score: 31,
    dire_score: 22,
    game_mode: 22,
    lobby_type: 7,
    region: 3,
    first_blood_time: 75,
    version: row.version,
    players,
    teamfights: parsed
      ? [
          {
            start: 1500,
            players: players.map((p) =>
              p.player_slot === 0 ? { deaths_pos: { 140: { 135: 1 } } } : {},
            ),
          },
        ]
      : null,
  };
}

/**
 * A stand-in for Groq's chat completions API (the AI match coach). It answers with three
 * coaching points that quote values from the FACTS lines it was sent, so they pass the app's
 * grounding checks. GET /groq/calls counts the calls (cached reviews must make none).
 */
let groqCalls = 0;
function groqCoach(body) {
  groqCalls++;
  const user = body.messages?.find((m) => m.role === "user")?.content ?? "";
  const facts = new Map();
  for (const line of user.split("\n")) {
    const parts = line.split(" | ");
    if (parts.length === 3) facts.set(parts[0], parts[2]);
  }
  const points = [];
  if (facts.has("lastHitsAt10"))
    points.push({
      kind: "strength",
      title: "Clean last hitting in lane",
      detail: `You had ${facts.get("lastHitsAt10")} last hits at 10:00. Keep that rhythm on every wave.`,
      facts: ["lastHitsAt10"],
    });
  if (facts.has("item.bfury"))
    points.push({
      kind: "improve",
      title: "Get Battle Fury sooner",
      detail: `Battle Fury came at ${facts.get("item.bfury")}. Stack a camp before you leave lane to buy it earlier.`,
      facts: ["item.bfury"],
    });
  points.push({
    kind: "improve",
    title: "Fewer deaths in fights",
    detail: `You died ${facts.get("deaths")} times. Wait for your team before you jump in.`,
    facts: ["deaths"],
  });
  return {
    id: `chatcmpl-fixture-${groqCalls}`,
    object: "chat.completion",
    choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify({ points }) } }],
  };
}

function matchDetail(id) {
  const coachAi = COACH_AI_MATCHES.findIndex((m) => String(m.match_id) === id);
  if (coachAi >= 0) return coachAiDetail(coachAi);
  const coach = COACH_MATCHES.findIndex((m) => String(m.match_id) === id);
  if (coach >= 0) return coachDetail(coach);
  const index = MATCHES.findIndex((m) => String(m.match_id) === id);
  if (index < 0) return null;
  const row = MATCHES[index];
  const parsed = row.version !== null;
  const shared = sharedSeats(index, row.player_slot);
  const players = [0, 1, 2, 3, 4, 128, 129, 130, 131, 132].map((slot) =>
    slot === row.player_slot
      ? player(slot, {
          account_id: ACCOUNT,
          personaname: "Fixture Hero",
          hero_id: row.hero_id,
          kills: row.kills,
          ...shared?.me,
          benchmarks: {
            gold_per_min: { raw: 612, pct: 0.83, pct_bracket: 0.7 },
            xp_per_min: { raw: 700, pct: 0.55, pct_bracket: 0.5 },
            last_hits_per_min: { raw: 8.4, pct: 0.97, pct_bracket: 0.95 },
            tower_damage: { raw: 300, pct: 0.12, pct_bracket: 0.1 },
          },
        })
      : shared && slot === shared.friendSlot
        ? player(slot, shared.friend)
        : {
            ...player(slot),
            benchmarks: { gold_per_min: { raw: 400, pct: 0.5, pct_bracket: null } },
          },
  );
  const withReplay = parsed
    ? players.map((p) => ({
        ...p,
        ...laningFields(p.player_slot, p.player_slot === row.player_slot),
      }))
    : players;
  return {
    match_id: row.match_id,
    start_time: row.start_time,
    duration: row.duration,
    radiant_win: row.radiant_win,
    radiant_score: 30,
    dire_score: 20,
    game_mode: 22,
    lobby_type: 7,
    region: 3,
    first_blood_time: 90,
    version: row.version,
    radiant_gold_adv: Array.from({ length: 30 }, (_, m) =>
      Math.round(Math.sin(m / 5) * 3000 + m * 200),
    ),
    radiant_xp_adv: Array.from({ length: 30 }, (_, m) => m * 150),
    players: withReplay,
    teamfights: parsed
      ? [
          {
            start: 1500,
            players: withReplay.map((p) =>
              p.player_slot === row.player_slot ? { deaths_pos: { 140: { 135: 1 } } } : {},
            ),
          },
        ]
      : null,
  };
}

// Synthetic Valve patch feed (shape of www.dota2.com/datafeed).
const PATCH_TIME = Math.floor(Date.now() / 1000) - 5 * DAY;
const PATCH_LIST = {
  success: true,
  patches: [
    { patch_number: "7.40", patch_name: "7.40", patch_timestamp: PATCH_TIME - 90 * DAY },
    { patch_number: "7.41", patch_name: "7.41", patch_timestamp: PATCH_TIME },
  ],
};
function patchNotes(version) {
  const entry = PATCH_LIST.patches.find((p) => p.patch_number === version);
  if (!entry) return { success: false, message: "Can't find patch notes" };
  return {
    ...entry,
    success: true,
    general_notes: [
      { title: "Global Changes", generic: [{ indent_level: 1, note: "Fixture general change" }] },
    ],
    items: [
      { ability_id: -1, title: "Basic Items", is_general_note: true, ability_notes: [] },
      { ability_id: 36, ability_notes: [{ indent_level: 1, note: "Magic Wand cost decreased" }] },
    ],
    neutral_items: [],
    heroes: [
      {
        hero_id: 14,
        hero_notes: [{ indent_level: 1, note: "Base Armor increased by 1" }],
        abilities: [
          {
            ability_id: 5075,
            ability_notes: [{ indent_level: 1, note: "Meat Hook cooldown reduced" }],
          },
        ],
      },
      { hero_id: 1, talent_notes: [{ indent_level: 1, note: "Level 10 talent changed" }] },
    ],
    neutral_creeps: [],
  };
}

// Synthetic hero catalog: the two named heroes the specs refer to, plus a pool large
// enough for full drafts. The role mix lets the rule-based AI make meaningful choices.
const ROLE_SETS = [
  ["Carry", "Escape"],
  ["Support", "Disabler"],
  ["Initiator", "Durable", "Disabler"],
  ["Nuker", "Pusher"],
  ["Carry", "Durable"],
  ["Support", "Nuker"],
];
const hero = (id, key, name, attr, attack, roles) => ({
  id,
  name: `npc_dota_hero_${key}`,
  localized_name: name,
  img: `/apps/dota2/images/dota_react/heroes/${key}.png?`,
  icon: `/apps/dota2/images/dota_react/heroes/icons/${key}.png?`,
  primary_attr: attr,
  attack_type: attack,
  roles,
});
const HEROES = {
  1: hero(1, "antimage", "Anti-Mage", "agi", "Melee", ["Carry", "Escape"]),
  14: hero(14, "pudge", "Pudge", "str", "Melee", ["Disabler", "Initiator", "Durable"]),
};
for (let id = 100; id < 140; id++) {
  HEROES[id] = hero(
    id,
    `fixture_${id}`,
    `Fixture Hero ${id}`,
    ["str", "agi", "int", "all"][id % 4],
    id % 2 ? "Ranged" : "Melee",
    ROLE_SETS[id % ROLE_SETS.length],
  );
}

// Synthetic players for search, profiles and "plays with". Names are made up.
const PEERS = [
  { account_id: 40_001, personaname: "Fixture Peer", with_games: 54, with_win: 28 },
  { account_id: 40_002, personaname: "Fixture Duo", with_games: 12, with_win: 5 },
  // Only ever an opponent: never listed under "Plays with".
  { account_id: 40_003, personaname: "Fixture Rival", with_games: 0, with_win: 0 },
];
const PLAYERS = [{ account_id: ACCOUNT, personaname: "Fixture Hero" }, ...PEERS];
const playerById = (id) => PLAYERS.find((p) => p.account_id === Number(id));

function profile(id) {
  const p = playerById(id);
  if (!p) return { profile: null, rank_tier: null };
  return {
    profile: {
      account_id: p.account_id,
      personaname: p.personaname,
      avatarfull: null,
      fh_unavailable: false,
    },
    rank_tier: p.account_id === ACCOUNT ? 80 : 54,
    leaderboard_rank: p.account_id === ACCOUNT ? 1234 : null,
  };
}

function search(q) {
  const needle = (q ?? "").toLowerCase();
  return PLAYERS.filter((p) => p.personaname.toLowerCase().includes(needle)).map((p, i) => ({
    account_id: p.account_id,
    personaname: p.personaname,
    avatarfull: null,
    last_match_time: new Date((NOW - (i + 1) * DAY) * 1000).toISOString(),
    similarity: 10 - i,
  }));
}

function peers(id) {
  if (Number(id) !== ACCOUNT) return [];
  return PEERS.map((p, i) => ({
    ...p,
    last_played: NOW - (i + 1) * DAY,
    win: p.with_win + 1,
    games: p.with_games + 3,
    against_win: 1,
    against_games: 3,
    avatarfull: null,
  }));
}

/**
 * `/players/{id}/heroes?hero_id=X`: counts over the games where the player was on hero X.
 * Anti-Mage (1): beats 101 (5 of 6), loses to 102 (1 of 5), 103 too few games; wins with 104.
 */
const PLAYER_MATCHUPS = {
  1: [
    { hero_id: 1, games: 8, win: 6 },
    { hero_id: 101, against_games: 6, against_win: 5, with_games: 1, with_win: 1 },
    { hero_id: 102, against_games: 5, against_win: 1 },
    { hero_id: 103, against_games: 2, against_win: 2 },
    { hero_id: 104, with_games: 7, with_win: 6 },
  ],
  14: [
    { hero_id: 14, games: 4, win: 1 },
    { hero_id: 105, against_games: 4, against_win: 1 },
  ],
};
function playerMatchups(id, heroId) {
  if (Number(id) !== ACCOUNT) return [];
  return (PLAYER_MATCHUPS[Number(heroId)] ?? []).map((r) => ({
    games: 0,
    win: 0,
    with_games: 0,
    with_win: 0,
    against_games: 0,
    against_win: 0,
    last_played: r.games ? NOW - DAY : 0,
    ...r,
  }));
}

function heroStats(id) {
  if (Number(id) !== ACCOUNT) return [];
  return [
    { hero_id: 1, last_played: NOW - DAY, games: 8, win: 5 },
    { hero_id: 14, last_played: NOW - 2 * DAY, games: 4, win: 2 },
    // A hero the fixture player keeps losing to (never played it themselves).
    { hero_id: 110, last_played: 0, games: 0, win: 0, against_games: 30, against_win: 6 },
  ];
}

// Synthetic public hero stats for the draft AI and challenges. Deterministic, made-up numbers:
// the named heroes (1, 14) sit at 48% so they never top a suggestion list.
const HERO_IDS = Object.keys(HEROES).map(Number);
function publicHeroStats() {
  return HERO_IDS.map((id) => {
    const rate = id < 100 ? 0.48 : 0.44 + ((id * 7) % 13) / 100;
    const bracket = (n) => {
      const pick = 6_000 + (id % 9) * 1_000 + n * 500;
      return [pick, Math.round(pick * rate)];
    };
    const [p6, w6] = bracket(0);
    const [p7, w7] = bracket(1);
    const [p8, w8] = bracket(2);
    // 7 days of public picks: every 5th hero gains share, every 7th loses it, the rest are flat.
    const drift = id % 5 === 0 ? 0.06 : id % 7 === 0 ? -0.06 : 0;
    const pickTrend = Array.from({ length: 7 }, (_, d) =>
      Math.round(20_000 * (1 + drift * (d - 3)) * (d === 5 || d === 6 ? 1.2 : 1)),
    );
    return {
      id,
      localized_name: HEROES[id].localized_name,
      roles: HEROES[id].roles,
      "6_pick": p6,
      "6_win": w6,
      "7_pick": p7,
      "7_win": w7,
      "8_pick": p8,
      "8_win": w8,
      pub_pick_trend: pickTrend,
      pub_win_trend: pickTrend.map((n) => Math.round(n * rate)),
      pro_pick: id % 4,
      pro_win: id % 2,
      pro_ban: id % 3,
    };
  });
}

/**
 * Lane-role scenarios (rows per lane role and game-length bucket; counts as strings, like the
 * real API). Lanes follow the fixture role sets: carries safe, nukers mid, initiators off,
 * supports split between the safe and off lanes.
 */
const LANE_SPLITS = [
  { 1: 0.8, 2: 0.2 },
  { 1: 0.5, 3: 0.5 },
  { 3: 0.8, 2: 0.2 },
  { 2: 0.8, 3: 0.2 },
  { 1: 0.6, 3: 0.4 },
  { 3: 0.6, 1: 0.4 },
];
function laneRoles(heroId) {
  const id = Number(heroId);
  if (!HEROES[id]) return [];
  const split = id === 1 ? { 1: 1 } : id === 14 ? { 3: 1 } : LANE_SPLITS[id % LANE_SPLITS.length];
  return Object.entries(split).flatMap(([lane, share]) =>
    [900, 1800, 2700].map((time) => {
      const games = Math.round(300 * share);
      const rate = 0.45 + ((id * 3 + Number(lane) * 7 + time / 900) % 11) / 100;
      return {
        hero_id: id,
        lane_role: Number(lane),
        time,
        games: String(games),
        wins: String(Math.round(games * rate)),
      };
    }),
  );
}

/**
 * Explorer (SQL over the pro match database). Only the two queries the Meta page sends are
 * recognised, by the tables they read; anything else answers like a failed query.
 */
function metaExplorer(sql) {
  const q = sql ?? "";
  if (q.includes("picks_bans")) {
    return {
      rows: HERO_IDS.filter((id) => id >= 100).map((id) => ({
        hero_id: id,
        picks: (id * 7) % 23,
        bans: (id * 5) % 31,
        leagues: 1 + (id % 4),
        drafts: 120,
      })),
      err: null,
    };
  }
  if (q.includes("player_matches")) {
    // Same-team lane pairs: a carry-type core with a support in the safe lane (1) and an
    // initiator with a support in the off lane (3).
    const rows = [];
    const cores = HERO_IDS.filter((id) => id >= 100 && [0, 4].includes(id % 6));
    const offlaners = HERO_IDS.filter((id) => id >= 100 && id % 6 === 2);
    const supports = HERO_IDS.filter((id) => id >= 100 && [1, 5].includes(id % 6));
    cores.slice(0, 5).forEach((c, i) => {
      const s = supports[i];
      const games = 8 + ((c + s) % 17);
      rows.push({
        h1: Math.min(c, s),
        h2: Math.max(c, s),
        lane_role: 1,
        games,
        wins: Math.round(games * (0.4 + (i % 4) * 0.08)),
      });
    });
    offlaners.slice(0, 5).forEach((o, i) => {
      const s = supports[supports.length - 1 - i];
      const games = 9 + ((o + s) % 13);
      rows.push({
        h1: Math.min(o, s),
        h2: Math.max(o, s),
        lane_role: 3,
        games,
        wins: Math.round(games * (0.42 + (i % 3) * 0.09)),
      });
    });
    // Too few games to show.
    rows.push({ h1: 101, h2: 102, lane_role: 1, games: 5, wins: 5 });
    return { rows, err: null };
  }
  return { rows: [], err: "error: unsupported fixture query" };
}
/** Head-to-head of `id` against every other hero; `wins` are `id`'s wins. */
function heroMatchups(id) {
  const self = Number(id);
  if (!HEROES[self]) return null;
  return HERO_IDS.filter((other) => other !== self).map((other) => {
    const skew = (((self * 31 + other * 17) % 21) - 10) / 200;
    const games = 300 + (other % 5) * 20;
    return { hero_id: other, games_played: games, wins: Math.round(games * (0.5 + skew)) };
  });
}

// Synthetic OpenDota explorer (pro match SQL). Answers by the shape of the query.
function draftExplorer(sql) {
  const q = sql ?? "";
  if (q.includes("lane_wins")) {
    // Pro lane meetings: lower id wins the lane more often (both directions returned).
    const rows = [];
    for (let a = 100; a < 140; a++) {
      for (const b of [a + 1, a + 2, a + 3]) {
        if (b >= 140) continue;
        const games = 6 + ((a + b) % 7);
        const wins = Math.round(games * 0.65);
        rows.push({ h1: a, h2: b, games, lane_wins: wins });
        rows.push({ h1: b, h2: a, games, lane_wins: games - wins });
      }
    }
    return { rows, err: null };
  }
  if (q.includes("AS pos1")) {
    // Where heroes are played, from their role mix: [pos1, pos2, pos3, pos4, pos5] shares.
    const SHARES = [
      [0.8, 0.15, 0.05, 0, 0], // Carry, Escape
      [0, 0, 0.02, 0.28, 0.7], // Support, Disabler
      [0.05, 0.05, 0.8, 0.1, 0], // Initiator, Durable, Disabler
      [0.1, 0.8, 0.05, 0.05, 0], // Nuker, Pusher
      [0.6, 0, 0.4, 0, 0], // Carry, Durable
      [0, 0.05, 0, 0.7, 0.25], // Support, Nuker
    ];
    const rows = HERO_IDS.map((id) => {
      const shares = id === 1 ? SHARES[0] : id === 14 ? [0, 0.05, 0.15, 0.6, 0.2] : SHARES[id % 6];
      const games = 100 + (id % 7) * 10;
      const [pos1, pos2, pos3, pos4, pos5] = shares.map((x) => Math.round(x * games));
      return { hero_id: id, pos1, pos2, pos3, pos4, pos5 };
    });
    return { rows, err: null };
  }
  if (q.includes("player_matches a")) {
    const rows = [];
    for (let a = 100; a < 140; a += 3) {
      const b = a + 1;
      const games = 8 + (a % 7);
      rows.push({ h1: a, h2: b, games, wins: Math.round(games * (a % 2 ? 0.7 : 0.35)) });
    }
    return { rows, err: null };
  }
  if (q.includes("leagues")) {
    return {
      rows: [
        { league: "Fixture Invitational", matches: 90 },
        { league: "Fixture Qualifier", matches: 30 },
      ],
      err: null,
    };
  }
  if (q.includes("picks_bans")) {
    return {
      rows: HERO_IDS.filter((id) => id >= 100).map((id) => {
        const picks = (id * 13) % 50;
        return { hero_id: id, picks, bans: (id * 7) % 40, wins: Math.floor(picks / 2) };
      }),
      err: null,
    };
  }
  return { rows: null, err: "unsupported fixture query" };
}

/** Route explorer SQL to the Meta page's fixture or the draft AI's, by what each query reads. */
function explorer(sql) {
  const q = sql ?? "";
  if (q.includes("notable_players")) {
    return { rows: [{ account_id: 60001, name: "Fixture Pro" }], err: null };
  }
  const meta = q.includes("AS drafts") || q.includes("a.lane=b.lane");
  return meta ? metaExplorer(q) : draftExplorer(q);
}

// Synthetic item catalog (names and prices made up to match the shape, not the game).
const ITEMS = [
  { id: 36, key: "magic_wand", dname: "Magic Wand", qual: "common", cost: 450 },
  { id: 44, key: "tango", dname: "Tango", qual: "consumable", cost: 90 },
  { id: 29, key: "boots", dname: "Boots of Speed", qual: "component", cost: 500 },
  { id: 63, key: "power_treads", dname: "Power Treads", qual: "common", cost: 1400 },
  { id: 145, key: "bfury", dname: "Battle Fury", qual: "epic", cost: 4100 },
  { id: 147, key: "manta", dname: "Manta Style", qual: "epic", cost: 4650 },
  { id: 116, key: "black_king_bar", dname: "Black King Bar", qual: "epic", cost: 4050 },
];

// Synthetic live games: one league game with a finished draft, one public high-MMR game.
function liveGames() {
  const lineup = (team, heroIds, names) =>
    heroIds.map((hero_id, i) => ({
      account_id: 50_000 + team * 10 + i,
      name: names[i],
      hero_id,
      team,
      is_pro: true,
    }));
  return [
    {
      match_id: "8000000001",
      league_id: 777,
      team_name_radiant: "Fixture Falcons",
      team_name_dire: "Fixture Titans",
      radiant_score: 21,
      dire_score: 14,
      radiant_lead: 8_400,
      game_time: 1_800,
      delay: 900,
      average_mmr: 0,
      spectators: 12_345,
      last_update_time: Math.floor(Date.now() / 1000),
      players: [
        ...lineup(0, [100, 101, 102, 103, 104], ["Ace", "Blaze", "Cobra", "Dune", "Echo"]),
        ...lineup(1, [105, 106, 107, 108, 109], ["Fang", "Ghost", "Hawk", "Iris", "Jolt"]),
      ],
    },
    {
      match_id: "8000000002",
      league_id: 0,
      radiant_score: 5,
      dire_score: 7,
      radiant_lead: -1_200,
      game_time: 600,
      delay: 120,
      average_mmr: 8_150,
      spectators: 40,
      last_update_time: Math.floor(Date.now() / 1000),
      players: [
        ...lineup(0, [110, 111, 112, 113, 114], ["a", "b", "c", "d", "e"]),
        ...lineup(1, [115, 116, 117, 118, 0], ["f", "g", "h", "i", "j"]),
      ],
    },
  ];
}

const routes = [
  [/^\/api\/live$/, () => liveGames()],
  [
    /^\/api\/leagues\/(\d+)$/,
    (m) =>
      m[1] === "777" ? { leagueid: 777, name: "Fixture Invitational", tier: "professional" } : null,
  ],
  [/^\/api\/heroStats$/, () => publicHeroStats()],
  [/^\/api\/heroes\/(\d+)\/matchups$/, (m) => heroMatchups(m[1])],
  // Replay parse requests (POST /request/:matchId).
  [/^\/api\/request\/(\d+)$/, () => ({ job: { jobId: 1 } })],
  // Hero guides: pro item popularity, public benchmarks and recent pro games.
  [
    /^\/api\/heroes\/(\d+)\/itemPopularity$/,
    () => ({
      start_game_items: { 44: 120, 36: 40 },
      early_game_items: { 29: 90, 44: 70, 63: 60 },
      mid_game_items: { 145: 50, 63: 20 },
      late_game_items: { 116: 30, 147: 25 },
    }),
  ],
  [
    /^\/api\/heroes\/(\d+)\/matches$/,
    () => [
      {
        match_id: 7100000001,
        start_time: 1790400000,
        duration: 2100,
        radiant_win: true,
        radiant: true,
        league_name: "Fixture Invitational",
        account_id: 60001,
        kills: 9,
        deaths: 2,
        assists: 7,
      },
      {
        match_id: 7100000002,
        start_time: 1790300000,
        duration: 2700,
        radiant_win: true,
        radiant: false,
        league_name: "Fixture Invitational",
        account_id: 60002,
        kills: 3,
        deaths: 8,
        assists: 4,
      },
    ],
  ],
  [
    /^\/api\/benchmarks$/,
    () => ({
      hero_id: 1,
      result: {
        gold_per_min: [
          { percentile: 0.5, value: 520 },
          { percentile: 0.9, value: 700 },
          { percentile: 0.99, value: 880 },
        ],
        last_hits_per_min: [
          { percentile: 0.5, value: 6.1 },
          { percentile: 0.9, value: 8.44 },
          { percentile: 0.99, value: 10.2 },
        ],
      },
    }),
  ],
  [/^\/api\/scenarios\/laneRoles$/, (_m, url) => laneRoles(url.searchParams.get("hero_id"))],
  [/^\/api\/explorer$/, (_m, url) => explorer(url.searchParams.get("sql"))],
  [/^\/api\/players\/(\d+)\/refresh$/, () => ({})],
  [/^\/api\/search$/, (_m, url) => search(url.searchParams.get("q"))],
  [
    /^\/api\/players\/(\d+)\/wl$/,
    (m) => (Number(m[1]) === ACCOUNT ? { win: 7, lose: 5 } : { win: 0, lose: 0 }),
  ],
  [
    /^\/api\/players\/(\d+)\/heroes$/,
    (m, url) =>
      url.searchParams.has("hero_id")
        ? playerMatchups(m[1], url.searchParams.get("hero_id"))
        : heroStats(m[1]),
  ],
  [/^\/api\/players\/(\d+)\/peers$/, (m) => peers(m[1])],
  [/^\/datafeed\/patchnoteslist$/, () => PATCH_LIST],
  [/^\/datafeed\/patchnotes$/, (_m, url) => patchNotes(url.searchParams.get("version"))],
  [/^\/api\/constants\/ability_ids$/, () => ({ 5075: "pudge_meat_hook" })],
  [
    /^\/api\/constants\/abilities$/,
    () => ({
      pudge_meat_hook: {
        dname: "Meat Hook",
        img: "/apps/dota2/images/dota_react/abilities/pudge_meat_hook.png",
      },
    }),
  ],
  [
    /^\/api\/players\/(\d+)\/matches$/,
    (m, url) => {
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const limit = Number(url.searchParams.get("limit") ?? 100);
      if (PLAYED.has(Number(m[1]))) return PLAYED.get(Number(m[1])).slice(offset, offset + limit);
      if (Number(m[1]) === COACH_AI) return COACH_AI_MATCHES.slice(offset, offset + limit);
      if (Number(m[1]) === COACH) {
        const heroId = url.searchParams.get("hero_id");
        return COACH_MATCHES.filter((r) => !heroId || r.hero_id === Number(heroId)).slice(
          offset,
          offset + limit,
        );
      }
      if (Number(m[1]) !== ACCOUNT) return [];
      // Matches the other account also played in (either team).
      const included = url.searchParams.get("included_account_id");
      const heroId = url.searchParams.get("hero_id");
      const rows = (
        !included
          ? MATCHES
          : Number(included) === FRIEND
            ? MATCHES.filter((_, i) => sharedIndices.includes(i))
            : []
      ).filter((r) => !heroId || r.hero_id === Number(heroId));
      return rows.slice(offset, offset + limit);
    },
  ],
  [/^\/api\/players\/(\d+)$/, (m) => profile(m[1])],
  [/^\/api\/matches\/(\d+)$/, (m) => matchDetail(m[1])],
  // Twitch (Helix) for live game streams.
  [/^\/twitch\/oauth2\/token$/, () => ({ access_token: "fixture-token", expires_in: 3600 })],
  [/^\/twitch\/helix\/streams$/, (_m, url) => twitchStreams(url)],
  [/^\/twitch\/helix\/users$/, (_m, url) => twitchUsers(url)],
  [/^\/twitch\/helix\/search\/channels$/, (_m, url) => twitchSearch(url)],
  // Kick's public API for live streams and channels.
  [/^\/kick\/oauth\/token$/, () => ({ access_token: "fixture-kick", expires_in: 5184000 })],
  [/^\/kick\/public\/v1\/livestreams$/, (_m, url) => kickLivestreams(url)],
  [/^\/kick\/public\/v1\/channels$/, (_m, url) => kickChannels(url)],
  [/^\/api\/constants\/patch$/, () => [{ name: "7.41", date: "2026-03-24T00:00:00Z", id: 60 }]],
  [/^\/api\/constants\/heroes$/, () => HEROES],
  [/^\/api\/constants\/item_ids$/, () => Object.fromEntries(ITEMS.map((i) => [i.id, i.key]))],
  [
    /^\/api\/constants\/items$/,
    () =>
      Object.fromEntries(
        ITEMS.map(({ key, ...item }) => [
          key,
          { ...item, img: `/apps/dota2/images/dota_react/items/${key}.png?t=1` },
        ]),
      ),
  ],
];

// Twitch (Helix): channels, and which are live (Dota 2 or another category).
const TWITCH_CDN = "https://static-cdn.jtvnw.net";
const twitchChannel = (id, login, name, live) => ({ id: String(id), login, name, live });
const TWITCH_CHANNELS = [
  twitchChannel(9001, "fixturecasts", "FixtureCasts", {
    title: "LIVE: Fixture Falcons vs Fixture Titans | Fixture Invitational",
    viewers: 12000,
    language: "en",
  }),
  twitchChannel(9002, "rankedgrinder", "RankedGrinder", {
    title: "ranked grind to immortal",
    viewers: 30000,
    language: "en",
  }),
  twitchChannel(9003, "pinoydota", "PinoyDota", {
    title: "Pub games with viewers",
    viewers: 900,
    language: "tl",
  }),
  // Live, but not playing Dota 2: found by search and in Following, not in the Dota list.
  twitchChannel(9004, "chattyfixture", "ChattyFixture", {
    title: "Just chatting about the patch",
    viewers: 450,
    language: "en",
    game: "Just Chatting",
  }),
  twitchChannel(9100, "fixturelegend", "FixtureLegend", null),
  // Went live a moment ago (Plus go-live alerts), in another category so the Dota list and
  // its counts stay as they are.
  twitchChannel(9005, "plusalertcaster", "PlusAlertCaster", {
    title: "Just went live",
    viewers: 5,
    language: "en",
    game: "Art",
    startedNow: true,
  }),
  // Enough small Spanish streams to need "Show more".
  ...Array.from({ length: 25 }, (_, i) =>
    twitchChannel(9200 + i, `fixturefiller${i}`, `FixtureFiller${i}`, {
      title: `Partidas tranquilas ${i}`,
      viewers: 100 - i,
      language: "es",
    }),
  ),
];
const twitchStream = (c) => ({
  user_id: c.id,
  user_login: c.login,
  user_name: c.name,
  title: c.live.title,
  viewer_count: c.live.viewers,
  language: c.live.language,
  game_name: c.live.game ?? "Dota 2",
  started_at: c.live.startedNow
    ? new Date(Date.now() - 2 * 60_000).toISOString()
    : "2026-10-01T10:00:00Z",
  thumbnail_url: `${TWITCH_CDN}/previews-ttv/live_user_${c.login}-{width}x{height}.jpg`,
});
function twitchStreams(url) {
  const logins = url.searchParams.getAll("user_login").map((l) => l.toLowerCase());
  const live = TWITCH_CHANNELS.filter((c) => c.live);
  const data = logins.length
    ? live.filter((c) => logins.includes(c.login))
    : live.filter((c) => !c.live.game);
  return {
    data: data.sort((a, b) => b.live.viewers - a.live.viewers).map(twitchStream),
    pagination: {},
  };
}
function twitchUsers(url) {
  const ids = url.searchParams.getAll("id");
  return {
    data: TWITCH_CHANNELS.filter((c) => ids.includes(c.id)).map((c) => ({
      id: c.id,
      login: c.login,
      display_name: c.name,
      profile_image_url: `${TWITCH_CDN}/jtv_user_pictures/${c.login}-profile_image-300x300.png`,
    })),
  };
}
function twitchSearch(url) {
  const q = (url.searchParams.get("query") ?? "").toLowerCase();
  const liveOnly = url.searchParams.get("live_only") === "true";
  return {
    data: TWITCH_CHANNELS.filter(
      (c) => c.login.includes(q.replace(/\s+/g, "")) && (!liveOnly || c.live),
    )
      .slice(0, Number(url.searchParams.get("first") ?? 20))
      .map((c) => ({
        id: c.id,
        broadcaster_login: c.login,
        display_name: c.name,
        is_live: !!c.live,
        title: c.live?.title ?? "",
        game_name: c.live ? (c.live.game ?? "Dota 2") : "",
        broadcaster_language: c.live?.language ?? "en",
        thumbnail_url: `${TWITCH_CDN}/jtv_user_pictures/${c.login}-profile_image-300x300.png`,
      })),
  };
}

// Kick: channels (by user id and slug), and which are live in Dota 2. No display names or
// name search on Kick's public API; profile pictures only on live streams.
const KICK_IMAGES = "https://images.kick.com";
const KICK_FILES = "https://files.kick.com";
const kickChannel = (id, slug, live) => ({ id, slug, live });
const KICK_CHANNELS = [
  kickChannel(7001, "kickcaster", {
    title: "Kick ranked grind, road to immortal",
    viewers: 5000,
    language: "en",
  }),
  kickChannel(7002, "kick_pinoy", { title: "Laro tayo, ranked", viewers: 300, language: "fil" }),
  // Mature streams stay out of the grid.
  kickChannel(7003, "mature_kick", {
    title: "Late night Dota",
    viewers: 8000,
    language: "en",
    mature: true,
  }),
  kickChannel(7100, "kickoffline", null),
];
const kickLivestream = (c) => ({
  broadcaster_user_id: c.id,
  channel_id: c.id + 100000,
  slug: c.slug,
  stream_title: c.live.title,
  language: c.live.language,
  has_mature_content: !!c.live.mature,
  viewer_count: c.live.viewers,
  thumbnail: `${KICK_IMAGES}/video_thumbnails/${c.slug}/480.webp`,
  started_at: c.live.startedNow
    ? new Date(Date.now() - 2 * 60_000).toISOString()
    : "2026-10-01T10:00:00Z",
  category: { id: 14, name: "Dota 2", thumbnail: `${KICK_FILES}/images/subcategories/14.jpg` },
  profile_picture: `${KICK_FILES}/images/user/${c.id}/profile_image/${c.slug}.webp`,
});
function kickLivestreams(url) {
  const ids = url.searchParams.getAll("broadcaster_user_id").map(Number);
  const live = KICK_CHANNELS.filter((c) => c.live && (!ids.length || ids.includes(c.id)));
  return {
    data: live.sort((a, b) => b.live.viewers - a.live.viewers).map(kickLivestream),
    message: "OK",
  };
}
function kickChannels(url) {
  const ids = url.searchParams.getAll("broadcaster_user_id").map(Number);
  const slugs = url.searchParams.getAll("slug").map((s) => s.toLowerCase());
  return {
    data: KICK_CHANNELS.filter((c) => ids.includes(c.id) || slugs.includes(c.slug)).map((c) => ({
      broadcaster_user_id: c.id,
      slug: c.slug,
      channel_description: "",
      banner_picture: "",
      stream: {
        url: "",
        key: "",
        is_live: !!c.live,
        is_mature: !!c.live?.mature,
        language: c.live?.language ?? "en",
        start_time: c.live ? "2026-10-01T10:00:00Z" : "0001-01-01T00:00:00Z",
        viewer_count: c.live?.viewers ?? 0,
        thumbnail: c.live ? `${KICK_IMAGES}/video_thumbnails/${c.slug}/480.webp` : "",
      },
      stream_title: c.live?.title ?? "",
      category: { id: 14, name: "Dota 2", thumbnail: "" },
    })),
    message: "OK",
  };
}

// Games "played" during a test (POST /e2e/play?account=…), newest first, per account.
const PLAYED = new Map();
let playedCount = 0;
/**
 * Options: `won` (default true), `enemyBase` (the Dire lineup is enemyBase…enemyBase+4, default
 * 105) and `lineups: false` for a game the upstream has no lineup for.
 */
function play(accountId, { won = true, enemyBase = 105, lineups = true } = {}) {
  playedCount++;
  const match = {
    match_id: 7_200_000_000 + playedCount,
    player_slot: 1,
    duration: 2045,
    game_mode: 22,
    lobby_type: 7,
    hero_id: 1,
    radiant_win: won,
    // Ends up after any webhook the test set up before playing.
    start_time: Math.ceil(Date.now() / 1000),
    version: null,
    kills: 9,
    deaths: 1,
    assists: 14,
    average_rank: 55,
    // Not recorded: the feed must say Unknown, never solo.
    party_size: null,
    // Both lineups (the `heroes` projection): the player in slot 1, fixture heroes elsewhere.
    heroes: lineups
      ? Object.fromEntries(
          [0, 1, 2, 3, 4, 128, 129, 130, 131, 132].map((slot, k) => [
            String(slot),
            { hero_id: slot === 1 ? 1 : slot < 128 ? 100 + k : enemyBase + k - 5 },
          ]),
        )
      : null,
  };
  PLAYED.set(accountId, [match, ...(PLAYED.get(accountId) ?? [])]);
  return match;
}

// Fake Discord webhooks: GET describes one, POST records a message, DELETE deletes it (as in
// Discord). Tokens starting with "unknown" don't exist. GET /discord/messages/:id lists posts.
const DISCORD_MESSAGES = new Map();
const DISCORD_DELETED = new Set();
function discord(req, res, url, body) {
  const json = (status, data) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(data === undefined ? "" : JSON.stringify(data));
  };
  const log = /^\/discord\/messages\/(\d+)$/.exec(url.pathname);
  if (log) return json(200, DISCORD_MESSAGES.get(log[1]) ?? []);
  const m = /^\/api\/webhooks\/(\d+)\/([\w-]+)$/.exec(url.pathname);
  if (!m) return false;
  const [, id, token] = m;
  if (DISCORD_DELETED.has(id) || token.startsWith("unknown"))
    return json(404, { message: "Unknown Webhook", code: 10015 });
  if (req.method === "GET")
    return json(200, {
      type: 1,
      id,
      name: "Fixture Den",
      channel_id: "555000000000000001",
      guild_id: "555000000000000000",
      token,
    });
  if (req.method === "POST") {
    DISCORD_MESSAGES.set(id, [...(DISCORD_MESSAGES.get(id) ?? []), JSON.parse(body || "{}")]);
    res.writeHead(204);
    return res.end();
  }
  if (req.method === "DELETE") {
    DISCORD_DELETED.add(id);
    res.writeHead(204);
    return res.end();
  }
  return json(405, { message: "405: Method Not Allowed", code: 0 });
}

// --- Steam Web API (ISteamUser) for "Friends playing now". Synthetic accounts only. ---------
const STEAM_KEY = "e2e-steam-key";
const STEAM_BASE = 76561197960265728n;
const sid = (accountId32) => (BigInt(accountId32) + STEAM_BASE).toString();
/** Identities used by tests/e2e/friends-playing.spec.ts (each test signs in as its own). */
const STEAM_FRIENDS = {
  // Public friend list: some friends in Dota 2, some hidden (private, other game, offline).
  "76561197960458881": [60_001, 60_002, 50_000, 60_003, 60_004, 60_005],
  // Public friend list: nobody in Dota 2 right now.
  "76561197960458882": [60_003, 60_004, 60_005],
};
// Presence by account: anything not listed is a public profile that is offline.
const STEAM_PRESENCE = {
  60_001: { personaname: "Fixture Friend", personastate: 1, gameid: "570" },
  60_002: {
    personaname: "Fixture Stacker",
    personastate: 1,
    gameid: "570",
    gameserversteamid: "90071992547409920",
  },
  // In OpenDota's live feed (match 8000000001).
  50_000: { personaname: "Fixture Pro", personastate: 1, gameid: "570" },
  // Private profile: Steam would not expose this, and the app must not show it.
  60_003: { personaname: "Fixture Private", personastate: 1, gameid: "570", visibility: 1 },
  60_004: { personaname: "Fixture Other Game", personastate: 1, gameid: "730" },
  60_005: { personaname: "Fixture Offline", personastate: 0 },
};

/** Steam answers 401 for a private friend list: every identity not listed above. */
function steamRoute(url) {
  if (!url.pathname.startsWith("/steam/")) return null;
  if (url.searchParams.get("key") !== STEAM_KEY) return { status: 403, body: {} };
  if (url.pathname === "/steam/ISteamUser/GetFriendList/v1/") {
    const friends = STEAM_FRIENDS[url.searchParams.get("steamid") ?? ""];
    if (!friends) return { status: 401, body: {} };
    return {
      status: 200,
      body: {
        friendslist: {
          friends: friends.map((id) => ({
            steamid: sid(id),
            relationship: "friend",
            friend_since: NOW - 30 * DAY,
          })),
        },
      },
    };
  }
  if (url.pathname === "/steam/ISteamUser/GetPlayerSummaries/v2/") {
    const ids = (url.searchParams.get("steamids") ?? "").split(",").filter(Boolean);
    const players = ids.map((steamid) => {
      const p = STEAM_PRESENCE[Number(BigInt(steamid) - STEAM_BASE)] ?? { personastate: 0 };
      const { visibility = 3, ...rest } = p;
      return {
        steamid,
        communityvisibilitystate: visibility,
        profilestate: 1,
        personaname: rest.personaname ?? `Fixture Steam ${steamid.slice(-4)}`,
        avatarfull: "",
        ...rest,
      };
    });
    return { status: 200, body: { response: { players } } };
  }
  return { status: 404, body: {} };
}

// Fake Resend API: records sent emails so E2E tests can read them (GET /resend/outbox?to=…).
const outbox = [];

function resend(req, res, url) {
  const json = (status, body) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (url.pathname === "/resend/emails" && req.method === "POST") {
    if (!/^Bearer .+/.test(req.headers.authorization ?? ""))
      return json(401, { name: "missing_api_key" });
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      const email = JSON.parse(raw || "{}");
      const id = `re_fixture_${outbox.length + 1}`;
      outbox.push({ id, ...email, idempotencyKey: req.headers["idempotency-key"] ?? null });
      json(200, { id });
    });
    return true;
  }
  if (url.pathname === "/resend/outbox" && req.method === "GET") {
    const to = url.searchParams.get("to");
    json(200, to ? outbox.filter((e) => e.to?.includes(to)) : outbox);
    return true;
  }
  return false;
}

const TINY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAACAAAAASCAIAAAC1qksFAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAJ0lEQVQ4jWOoiLKhKWIYtSBqNIhsRlNRxWhGsxktKipGS9Mo2lY4ALK6X59aY36mAAAAAElFTkSuQmCC";

createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  if (url.pathname === "/health") return res.end("ok");
  // Hero and rank art for the /img resize routes (IMAGE_SOURCE_BASE_URL): one tiny image.
  if (/^\/images\/(hero|rank)\/[a-z0-9_]+\.png$/.test(url.pathname)) {
    res.writeHead(200, { "content-type": "image/png" });
    return res.end(Buffer.from(TINY_PNG, "base64"));
  }
  if (url.pathname === "/e2e/play" && req.method === "POST") {
    res.writeHead(200, { "content-type": "application/json" });
    const q = url.searchParams;
    const match = play(Number(q.get("account")), {
      won: q.get("result") !== "loss",
      enemyBase: q.has("enemies") ? Number(q.get("enemies")) : undefined,
      lineups: q.get("lineups") !== "none",
    });
    return res.end(JSON.stringify(match));
  }
  if (url.pathname.startsWith("/api/webhooks/") || url.pathname.startsWith("/discord/")) {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      if (discord(req, res, url, body) === false) {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Not Found" }));
      }
    });
    return;
  }
  const steam = steamRoute(url);
  if (steam) {
    res.writeHead(steam.status, { "content-type": "application/json" });
    return res.end(JSON.stringify(steam.body));
  }
  if (url.pathname.startsWith("/resend/") && resend(req, res, url) !== false) return;
  if (url.pathname === "/groq/calls") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ calls: groqCalls }));
  }
  if (url.pathname === "/groq/openai/v1/chat/completions" && req.method === "POST") {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      if (!/^Bearer .+/.test(req.headers.authorization ?? "")) {
        res.writeHead(401, { "content-type": "application/json" });
        return res.end(JSON.stringify({ error: { message: "Invalid API Key" } }));
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(groqCoach(JSON.parse(raw || "{}"))));
    });
    return;
  }
  for (const [re, handler] of routes) {
    const m = re.exec(url.pathname);
    if (!m) continue;
    const body = handler(m, url);
    res.writeHead(body === null ? 404 : 200, { "content-type": "application/json" });
    return res.end(JSON.stringify(body ?? { error: "Not Found" }));
  }
  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "Not Found" }));
}).listen(PORT, () => console.log(`OpenDota fixture server on :${PORT}`));
