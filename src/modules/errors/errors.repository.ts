import "server-only";
import type { Db } from "mongodb";
import type { ErrorGroup } from "./domain/error-event";
import { ERROR_RETENTION_S, ERRORS_COLLECTION, type ErrorEventDocument } from "./errors.model";
import type { ErrorsRepositoryPort } from "./errors.ports";

export class ErrorsRepository implements ErrorsRepositoryPort {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async col() {
    return (await this.getDb()).collection<ErrorEventDocument>(ERRORS_COLLECTION);
  }

  async ensureIndexes(): Promise<void> {
    const col = await this.col();
    await Promise.all([
      col.createIndex({ at: 1 }, { expireAfterSeconds: ERROR_RETENTION_S, name: "ttl_30d" }),
      col.createIndex({ fingerprint: 1, at: -1 }, { name: "by_fingerprint" }),
    ]);
  }

  async insert(event: ErrorEventDocument): Promise<void> {
    await (await this.col()).insertOne({ ...event });
  }

  async groupsSince(since: Date, limit: number): Promise<ErrorGroup[]> {
    return (await this.col())
      .aggregate<ErrorGroup>([
        { $match: { at: { $gte: since } } },
        { $sort: { at: -1 } },
        {
          $group: {
            _id: "$fingerprint",
            source: { $first: "$source" },
            message: { $first: "$message" },
            route: { $first: "$route" },
            path: { $first: "$path" },
            count: { $sum: 1 },
            firstAt: { $last: "$at" },
            lastAt: { $first: "$at" },
          },
        },
        { $sort: { lastAt: -1 } },
        { $limit: limit },
        {
          $project: {
            _id: 0,
            fingerprint: "$_id",
            source: 1,
            message: 1,
            route: 1,
            path: 1,
            count: 1,
            firstAt: 1,
            lastAt: 1,
          },
        },
      ])
      .toArray();
  }
}
