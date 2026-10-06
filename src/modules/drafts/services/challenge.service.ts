import { err, ok, type Result } from "@/common/result";
import {
  generatePuzzle,
  gradeAnswer,
  matchupHeroes,
  validateAnswer,
  type ChallengeResult,
  type Puzzle,
  type PuzzleError,
} from "../domain/challenges";
import type { MatchupTable, ScoringHero } from "../domain/draft-scoring";
import type { DraftInsights } from "../drafts.ports";
import type { GradeError } from "../dtos/responses/drafts.dto";

/** Builds challenge positions and referees answers. The server re-derives every position. */

export class ChallengeService {
  constructor(
    private readonly deps: { insights: DraftInsights | null; heroes: readonly ScoringHero[] },
  ) {}

  puzzle(type: string, seed: string): Result<Puzzle, PuzzleError> {
    return generatePuzzle(type, seed, this.deps.heroes);
  }

  async grade(
    type: string,
    seed: string,
    answer: readonly number[],
  ): Promise<Result<{ puzzle: Puzzle; result: ChallengeResult }, GradeError>> {
    const puzzle = this.puzzle(type, seed);
    if (!puzzle.ok) return puzzle;
    const valid = validateAnswer(puzzle.value, this.deps.heroes, answer);
    if (!valid.ok) return err({ type: "illegal_answer", cause: valid.error });

    // Same public data as the AI captain; failures degrade to "no data" (role-fit grading).
    const insights = this.deps.insights;
    const [meta, tables] = await Promise.all([
      insights?.heroMeta().catch(() => new Map()) ?? Promise.resolve(new Map()),
      Promise.all(
        matchupHeroes(puzzle.value).map(
          async (id) => [id, await insights?.matchups(id).catch(() => null)] as const,
        ),
      ),
    ]);
    const matchups = new Map(tables.filter((t): t is readonly [number, MatchupTable] => !!t[1]));
    const result = gradeAnswer(puzzle.value, this.deps.heroes, valid.value, { meta, matchups });
    return ok({ puzzle: puzzle.value, result });
  }
}
