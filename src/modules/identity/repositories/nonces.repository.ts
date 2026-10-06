import "server-only";
import type { Db } from "mongodb";
import { IDENTITY_COLLECTIONS, type NonceDocument } from "../identity.model";
import type { NonceStore } from "../identity.ports";

export class NoncesRepository implements NonceStore {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async col() {
    return (await this.getDb()).collection<NonceDocument>(IDENTITY_COLLECTIONS.nonces);
  }

  async consume(nonce: string, expiresAt: Date): Promise<boolean> {
    try {
      await (await this.col()).insertOne({ _id: nonce, expiresAt });
      return true;
    } catch (e) {
      if (typeof e === "object" && e !== null && "code" in e && e.code === 11000) return false;
      throw e;
    }
  }

  async ensureIndexes(): Promise<void> {
    await (
      await this.col()
    ).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "ttl_expiresAt" });
  }
}
