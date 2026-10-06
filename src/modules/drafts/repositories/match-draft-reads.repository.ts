import "server-only";
import type { Db } from "mongodb";

const COLLECTION = "match_draft_reads";
const KEEP_S = 180 * 24 * 3600;

interface ReadDoc {
  _id: string;
  radiantPct: number;
  computedAt: Date;
}

/** Draft estimates per match (a match's lineups never change), kept 180 days. */
export class MatchDraftReadsRepository {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async col() {
    return (await this.getDb()).collection<ReadDoc>(COLLECTION);
  }

  async ensureIndexes(): Promise<void> {
    await (
      await this.col()
    ).createIndex({ computedAt: 1 }, { expireAfterSeconds: KEEP_S, name: "ttl_180d" });
  }

  /** Saved radiant win estimates by match id. */
  async find(matchIds: readonly string[]): Promise<Map<string, number>> {
    const docs = await (await this.col()).find({ _id: { $in: [...matchIds] } }).toArray();
    return new Map(docs.map((d) => [d._id, d.radiantPct]));
  }

  async save(matchId: string, radiantPct: number): Promise<void> {
    await (
      await this.col()
    ).updateOne(
      { _id: matchId },
      { $set: { radiantPct, computedAt: new Date() } },
      { upsert: true },
    );
  }
}
