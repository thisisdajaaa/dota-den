/**
 * Fit the draft outlook's weights to real results.
 *
 * Usage: npm run draft:calibrate   (reads OPENDOTA_API_KEY from .env.local if present)
 *
 * 1. Recent ranked Divine+ All Pick games (hero picks and the winner) from OpenDota's
 *    explorer.
 * 2. Each draft is scored with the same outlook code the app uses, on today's data.
 * 3. A logistic regression is fitted on the older 80% and tested on the newest 20%.
 * 4. The weights and the held-out accuracy are written to
 *    src/modules/drafts/domain/draft-calibration.json (commit it).
 *
 * Caveat: hero win rates and matchups come from recent public games that overlap these
 * games, so accuracy is a little optimistic. It's still far better than guessing weights.
 */
import { writeFileSync } from "node:fs";
import { z } from "zod";
import {
  criteriaFeatures,
  criteriaWeightsFrom,
  ESTIMATE_FEATURES,
  estimateFeatures,
  evaluate,
  fitLogistic,
  sigmoid,
  type Calibration,
  type Sample,
} from "@/modules/drafts/domain/draft-calibration";
import { draftOutlook } from "@/modules/drafts/domain/draft-outlook";
import { CRITERIA } from "@/modules/drafts/domain/draft-report";
import type { MatchupTable, ScoringHero } from "@/modules/drafts/domain/draft-scoring";
import { OpenDotaDraftInsights } from "@/modules/drafts/infrastructure/opendota-draft-insights";
import { ProviderGateway } from "@/modules/shared/infrastructure/provider-gateway";

const BASE = process.env.OPENDOTA_BASE_URL ?? "https://api.opendota.com/api";
const KEY = process.env.OPENDOTA_API_KEY;
const DAYS = Number(process.env.CALIBRATE_DAYS ?? 14);
const LIMIT = Number(process.env.CALIBRATE_GAMES ?? 15_000);
const OUT = "src/modules/drafts/domain/draft-calibration.json";

const url = (path: string, params: Record<string, string> = {}) => {
  const u = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  if (KEY) u.searchParams.set("api_key", KEY);
  return u.toString();
};

const gateway = new ProviderGateway({ name: "calibrate", timeoutMs: 60_000, maxRetries: 3 });
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

const GameSchema = z.object({
  match_id: z.coerce.number(),
  radiant_win: z.boolean(),
  radiant_team: z.array(z.number().int()).length(5),
  dire_team: z.array(z.number().int()).length(5),
});

async function main() {
  log(`Fetching up to ${LIMIT} ranked Divine+ games from the last ${DAYS} days…`);
  const sql = `SELECT match_id, radiant_win, radiant_team, dire_team FROM public_matches WHERE start_time > extract(epoch from now() - interval '${DAYS} days') AND lobby_type = 7 AND game_mode = 22 AND avg_rank_tier >= 70 AND duration > 900 ORDER BY match_id DESC LIMIT ${LIMIT}`;
  const gamesRes = await gateway.getJson(url("/explorer", { sql }));
  if (!gamesRes.ok) throw new Error(`explorer failed: ${JSON.stringify(gamesRes)}`);
  const rows = (gamesRes.body as { rows?: unknown[] }).rows ?? [];
  const games = rows
    .map((r) => GameSchema.safeParse(r))
    .filter((r) => r.success)
    .map((r) => r.data!)
    .filter((g) => [...g.radiant_team, ...g.dire_team].every((id) => id > 0))
    .sort((a, b) => a.match_id - b.match_id);
  log(`${games.length} usable games`);

  const statsRes = await gateway.getJson(url("/heroStats"));
  if (!statsRes.ok) throw new Error("heroStats failed");
  const heroes = new Map<number, ScoringHero>(
    (statsRes.body as { id: number; localized_name: string; roles: string[] }[]).map((h) => [
      h.id,
      { id: h.id, name: h.localized_name, roles: h.roles },
    ]),
  );

  const insights = new OpenDotaDraftInsights(gateway, {
    baseUrl: BASE,
    apiKey: KEY,
    budgetMs: 120_000,
  });
  const [meta, pro, synergy, positions, lanes] = await Promise.all([
    insights.heroMeta(),
    insights.proMeta(),
    insights.synergy(),
    insights.positions(),
    insights.lanes(),
  ]);
  log(
    `meta ${meta.size}, pro ${pro?.matches ?? 0} drafts, synergy ${synergy?.size ?? 0}, positions ${positions?.size ?? 0}, lanes ${lanes?.size ?? 0}`,
  );

  log(`Fetching matchup tables for ${heroes.size} heroes…`);
  const matchups = new Map<number, MatchupTable>();
  const ids = [...heroes.keys()];
  for (let i = 0; i < ids.length; i += 3) {
    const batch = await Promise.all(
      ids.slice(i, i + 3).map(async (id) => [id, await insights.matchups(id)] as const),
    );
    for (const [id, t] of batch) if (t) matchups.set(id, t);
    await new Promise((r) => setTimeout(r, KEY ? 100 : 3_100)); // free tier: 60 calls a minute
  }
  log(`${matchups.size} matchup tables`);

  log("Scoring drafts…");
  const scored = games.flatMap((g) => {
    const radiant = g.radiant_team.map((id) => heroes.get(id)).filter((h): h is ScoringHero => !!h);
    const dire = g.dire_team.map((id) => heroes.get(id)).filter((h): h is ScoringHero => !!h);
    if (radiant.length !== 5 || dire.length !== 5) return [];
    const o = draftOutlook({
      radiant,
      dire,
      meta,
      matchups,
      pro: pro ?? undefined,
      synergy: synergy ?? undefined,
      positions: positions ?? undefined,
      lanes: lanes ?? undefined,
    });
    return [{ o, y: (g.radiant_win ? 1 : 0) as 0 | 1 }];
  });
  const cut = Math.floor(scored.length * 0.8);
  const train = scored.slice(0, cut);
  const test = scored.slice(cut);
  log(`train ${train.length}, test ${test.length}`);

  // The win estimate.
  const est = (o: (typeof scored)[number]["o"]) =>
    ESTIMATE_FEATURES.map((f) => estimateFeatures(o)[f]);
  const fit = fitLogistic(
    train.map((s) => ({ x: est(s.o), y: s.y }) satisfies Sample),
    {
      iterations: 3_000,
      rate: 0.02,
    },
  );
  const fittedProbs = test.map((s) =>
    sigmoid(fit.intercept + est(s.o).reduce((a, x, i) => a + x * fit.weights[i], 0)),
  );
  const labels = test.map((s) => s.y);
  const handTuned = test.map((s) => (s.o.radiantPct ?? 50) / 100);
  const radiantShare = train.reduce((a, s) => a + s.y, 0) / train.length;
  const baseline = test.map(() => radiantShare);

  // The report card weights.
  const keys = CRITERIA.map((c) => c.key);
  const crit = (o: (typeof scored)[number]["o"]) => keys.map((k) => criteriaFeatures(o)[k]);
  const critFit = fitLogistic(
    train.map((s) => ({ x: crit(s.o), y: s.y })),
    { iterations: 3_000, rate: 0.05 },
  );

  const calibration: Calibration = {
    fittedAt: new Date().toISOString(),
    source: `${scored.length.toLocaleString("en-US")} ranked Divine+ games from the last ${DAYS} days`,
    trainGames: train.length,
    testGames: test.length,
    estimate: {
      intercept: round(fit.intercept),
      weights: Object.fromEntries(
        ESTIMATE_FEATURES.map((f, i) => [f, round(fit.weights[i])]),
      ) as Calibration["estimate"]["weights"],
    },
    criteriaWeights: criteriaWeightsFrom(keys, critFit.weights),
    holdout: {
      fitted: rounded(evaluate(fittedProbs, labels)),
      handTuned: rounded(evaluate(handTuned, labels)),
      baseline: rounded(evaluate(baseline, labels)),
    },
  };
  log(
    "criteria coefficients",
    Object.fromEntries(keys.map((k, i) => [k, round(critFit.weights[i])])),
  );
  log(JSON.stringify(calibration, null, 2));
  writeFileSync(OUT, `${JSON.stringify(calibration, null, 2)}\n`);
  log(`Wrote ${OUT}`);
}

const round = (n: number) => Math.round(n * 10_000) / 10_000;
const rounded = (e: { accuracy: number; logLoss: number }) => ({
  accuracy: round(e.accuracy),
  logLoss: round(e.logLoss),
});

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
