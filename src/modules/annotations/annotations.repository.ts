import "server-only";
import type { Db } from "mongodb";
import { forExport, type DataOwner } from "@/common/privacy/user-data";
import {
  ANNOTATIONS_COLLECTION,
  annotationId,
  type MatchAnnotation,
  type MatchAnnotationDocument,
} from "./annotations.model";
import type { AnnotationsRepositoryPort } from "./annotations.ports";

export class AnnotationsRepository implements AnnotationsRepositoryPort {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async col() {
    return (await this.getDb()).collection<MatchAnnotationDocument>(ANNOTATIONS_COLLECTION);
  }

  async ensureIndexes(): Promise<void> {
    await (await this.col()).createIndex({ userId: 1, tags: 1 }, { name: "by_user_tag" });
  }

  async find(userId: string, matchId: string): Promise<MatchAnnotation | null> {
    const doc = await (await this.col()).findOne({ _id: annotationId(userId, matchId) });
    if (!doc) return null;
    const { _id: _i, ...rest } = doc;
    return rest;
  }

  async save(a: MatchAnnotation): Promise<void> {
    await (
      await this.col()
    ).updateOne({ _id: annotationId(a.userId, a.matchId) }, { $set: a }, { upsert: true });
  }

  async remove(userId: string, matchId: string): Promise<void> {
    await (await this.col()).deleteOne({ _id: annotationId(userId, matchId) });
  }

  /** Your tags with how many matches carry each, most used first. */
  async tagCounts(userId: string) {
    return (await this.col())
      .aggregate<{ tag: string; matches: number }>([
        { $match: { userId } },
        { $unwind: "$tags" },
        { $group: { _id: "$tags", matches: { $sum: 1 } } },
        { $sort: { matches: -1, _id: 1 } },
        { $limit: 30 },
        { $project: { _id: 0, tag: "$_id", matches: 1 } },
      ])
      .toArray();
  }

  async matchIdsWithTag(userId: string, tag: string): Promise<string[]> {
    const docs = await (
      await this.col()
    )
      .find({ userId, tags: tag }, { projection: { matchId: 1 } })
      .limit(5_000)
      .toArray();
    return docs.map((d) => d.matchId);
  }

  async exportForOwner(owner: DataOwner) {
    return forExport(await (await this.col()).find({ userId: owner.userId }).toArray());
  }

  async deleteForOwner(owner: DataOwner): Promise<number> {
    return (await (await this.col()).deleteMany({ userId: owner.userId })).deletedCount;
  }
}
