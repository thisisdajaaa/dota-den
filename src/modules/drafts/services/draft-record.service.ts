import { draftRecord } from "../domain/draft-record";
import type { DraftRecordView } from "../dtos/responses/draft-record.dto";
import type { RankedLineup } from "../drafts.ports";

/** Ranked games looked at, and new games graded per request (each costs matchup lookups). */
export const DRAFT_RECORD_GAMES = 30;
export const DRAFT_RECORD_NEW_PER_VIEW = 6;
/** The outlook's fitted accuracy before any game is graded in this request. */
const DEFAULT_ACCURACY = 0.57;

/**
 * Your recent ranked games graded by the draft outlook. Grades are saved per match and a few
 * new ones are added per view, so the record fills in over a couple of visits.
 */
export class DraftRecordService {
  constructor(
    private readonly deps: {
      lineups: (accountId32: number, limit: number) => Promise<RankedLineup[] | null>;
      reads: {
        find(matchIds: readonly string[]): Promise<Map<string, number>>;
        save(matchId: string, radiantPct: number): Promise<void>;
      };
      outlook: () => Promise<{
        outlookForHeroes(
          radiant: number[],
          dire: number[],
        ): Promise<{ radiantPct: number | null; accuracy: { fitted: number } }>;
      }>;
    },
  ) {}

  async forPlayer(accountId32: number): Promise<DraftRecordView | null> {
    const lineups = await this.deps.lineups(accountId32, DRAFT_RECORD_GAMES);
    if (!lineups) return null;
    const saved = await this.deps.reads.find(lineups.map((l) => l.matchId));
    const missing = lineups
      .filter((l) => !saved.has(l.matchId))
      .slice(0, DRAFT_RECORD_NEW_PER_VIEW);
    let accuracy = DEFAULT_ACCURACY;
    if (missing.length > 0) {
      const ai = await this.deps.outlook();
      for (const l of missing) {
        const outlook = await ai.outlookForHeroes(l.radiant, l.dire).catch(() => null);
        if (!outlook || outlook.radiantPct === null) continue;
        accuracy = outlook.accuracy.fitted;
        saved.set(l.matchId, outlook.radiantPct);
        await this.deps.reads.save(l.matchId, outlook.radiantPct).catch(() => {});
      }
    }
    const graded = lineups.flatMap((l) =>
      saved.has(l.matchId)
        ? [{ yourSide: l.yourSide, won: l.won, radiantPct: saved.get(l.matchId)! }]
        : [],
    );
    return { record: draftRecord(graded), total: lineups.length, accuracy };
  }
}
