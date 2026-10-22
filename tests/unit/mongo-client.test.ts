import { describe, expect, it, vi } from "vitest";

const created = vi.hoisted(() => [] as Array<{ uri: string; options: Record<string, unknown> }>);
vi.mock("mongodb", () => ({
  MongoClient: class {
    constructor(uri: string, options: Record<string, unknown>) {
      created.push({ uri, options });
    }
    async connect() {
      return this;
    }
    db() {
      return {};
    }
  },
}));

describe("MongoDB client", () => {
  it("closes idle connections after a minute and limits each operation to 10 seconds", async () => {
    vi.stubEnv("APP_URL", "http://localhost:3000");
    vi.stubEnv("MONGODB_URI", "mongodb://example.invalid:27017");
    (globalThis as { __ddMongo?: unknown }).__ddMongo = undefined;
    const { getMongoClient } = await import("@/common/db/mongo");
    await getMongoClient();
    expect(created[0].options).toMatchObject({
      maxIdleTimeMS: 60_000,
      timeoutMS: 10_000,
      serverSelectionTimeoutMS: 5_000,
    });
    vi.unstubAllEnvs();
  });
});
