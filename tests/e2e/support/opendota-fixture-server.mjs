/**
 * Fixture OpenDota API for E2E runs. Synthetic data only; no real players.
 * Serves the handful of endpoints the app uses, shaped like the real API.
 */
import { createServer } from "node:http";

const PORT = Number(process.env.FIXTURE_PORT ?? 3101);
const ACCOUNT = 22202;
const DAY = 86_400;
const NOW = Math.floor(Date.now() / 1000);

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
}));

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

function matchDetail(id) {
  const row = MATCHES.find((m) => String(m.match_id) === id);
  if (!row) return null;
  const players = [0, 1, 2, 3, 4, 128, 129, 130, 131, 132].map((slot) =>
    slot === row.player_slot
      ? player(slot, {
          account_id: ACCOUNT,
          personaname: "Fixture Hero",
          hero_id: row.hero_id,
          kills: row.kills,
        })
      : player(slot),
  );
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
    version: 22,
    radiant_gold_adv: Array.from({ length: 30 }, (_, m) =>
      Math.round(Math.sin(m / 5) * 3000 + m * 200),
    ),
    radiant_xp_adv: Array.from({ length: 30 }, (_, m) => m * 150),
    players,
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

function heroStats(id) {
  if (Number(id) !== ACCOUNT) return [];
  return [
    { hero_id: 1, last_played: NOW - DAY, games: 8, win: 5 },
    { hero_id: 14, last_played: NOW - 2 * DAY, games: 4, win: 2 },
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
    return {
      id,
      localized_name: HEROES[id].localized_name,
      "6_pick": p6,
      "6_win": w6,
      "7_pick": p7,
      "7_win": w7,
      "8_pick": p8,
      "8_win": w8,
    };
  });
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

const routes = [
  [/^\/api\/heroStats$/, () => publicHeroStats()],
  [/^\/api\/heroes\/(\d+)\/matchups$/, (m) => heroMatchups(m[1])],
  [/^\/api\/players\/(\d+)\/refresh$/, () => ({})],
  [/^\/api\/search$/, (_m, url) => search(url.searchParams.get("q"))],
  [
    /^\/api\/players\/(\d+)\/wl$/,
    (m) => (Number(m[1]) === ACCOUNT ? { win: 7, lose: 5 } : { win: 0, lose: 0 }),
  ],
  [/^\/api\/players\/(\d+)\/heroes$/, (m) => heroStats(m[1])],
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
      if (Number(m[1]) !== ACCOUNT) return [];
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const limit = Number(url.searchParams.get("limit") ?? 100);
      return MATCHES.slice(offset, offset + limit);
    },
  ],
  [/^\/api\/players\/(\d+)$/, (m) => profile(m[1])],
  [/^\/api\/matches\/(\d+)$/, (m) => matchDetail(m[1])],
  [/^\/api\/constants\/patch$/, () => [{ name: "7.41", date: "2026-03-24T00:00:00Z", id: 60 }]],
  [/^\/api\/constants\/heroes$/, () => HEROES],
  [/^\/api\/constants\/item_ids$/, () => ({ 36: "magic_wand" })],
  [
    /^\/api\/constants\/items$/,
    () => ({
      magic_wand: {
        id: 36,
        img: "/apps/dota2/images/dota_react/items/magic_wand.png?t=1",
        dname: "Magic Wand",
      },
    }),
  ],
];

createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  if (url.pathname === "/health") return res.end("ok");
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
