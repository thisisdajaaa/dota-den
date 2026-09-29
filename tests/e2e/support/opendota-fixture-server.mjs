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

const routes = [
  [
    /^\/api\/players\/(\d+)\/matches$/,
    (m, url) => {
      if (Number(m[1]) !== ACCOUNT) return [];
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const limit = Number(url.searchParams.get("limit") ?? 100);
      return MATCHES.slice(offset, offset + limit);
    },
  ],
  [
    /^\/api\/players\/(\d+)$/,
    (m) =>
      Number(m[1]) === ACCOUNT
        ? {
            profile: {
              account_id: ACCOUNT,
              personaname: "Fixture Hero",
              avatarfull: null,
              fh_unavailable: false,
            },
            rank_tier: 80,
            leaderboard_rank: 1234,
          }
        : { profile: null, rank_tier: null },
  ],
  [/^\/api\/matches\/(\d+)$/, (m) => matchDetail(m[1])],
  [/^\/api\/constants\/patch$/, () => [{ name: "7.41", date: "2026-03-24T00:00:00Z", id: 60 }]],
  [
    /^\/api\/constants\/heroes$/,
    () => ({
      1: {
        id: 1,
        localized_name: "Anti-Mage",
        img: "/fixture/antimage.png?",
        icon: "/fixture/antimage_icon.png?",
        primary_attr: "agi",
      },
      14: {
        id: 14,
        localized_name: "Pudge",
        img: "/fixture/pudge.png?",
        icon: "/fixture/pudge_icon.png?",
        primary_attr: "str",
      },
    }),
  ],
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
