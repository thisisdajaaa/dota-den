import "server-only";
import type { Db } from "mongodb";
import { forExport, type DataOwner } from "@/common/privacy/user-data";
import { DISCORD_COLLECTIONS, type DiscordGuildDocument } from "../discord.model";
import type { DiscordGuildsPort, StoredGuild } from "../discord.ports";

const toGuild = (d: DiscordGuildDocument): StoredGuild => ({
  guildId: d._id,
  channelId: d.channelId,
  recap: d.recap,
  nudges: d.nudges,
  language: d.language,
  userId: d.userId,
  setupByDiscordId: d.setupByDiscordId,
  lastRecapWeek: d.lastRecapWeek,
});

/** Servers' bot settings (`/den setup`): one document per server. */
export class DiscordGuildsRepository implements DiscordGuildsPort {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async col() {
    return (await this.getDb()).collection<DiscordGuildDocument>(DISCORD_COLLECTIONS.guilds);
  }

  async ensureIndexes(): Promise<void> {
    const col = await this.col();
    await Promise.all([
      col.createIndex({ recap: 1 }, { name: "by_recap" }),
      col.createIndex({ userId: 1 }, { name: "by_user" }),
    ]);
  }

  async get(guildId: string): Promise<StoredGuild | null> {
    const d = await (await this.col()).findOne({ _id: guildId });
    return d ? toGuild(d) : null;
  }

  async save(guild: Omit<StoredGuild, "lastRecapWeek">, now: Date): Promise<void> {
    await (
      await this.col()
    ).updateOne(
      { _id: guild.guildId },
      {
        $set: {
          channelId: guild.channelId,
          recap: guild.recap,
          nudges: guild.nudges,
          language: guild.language,
          userId: guild.userId,
          setupByDiscordId: guild.setupByDiscordId,
          updatedAt: now,
        },
        $setOnInsert: { lastRecapWeek: null, createdAt: now },
      },
      { upsert: true },
    );
  }

  async withRecap(): Promise<StoredGuild[]> {
    return (await (await this.col()).find({ recap: true, channelId: { $ne: null } }).toArray()).map(
      toGuild,
    );
  }

  async markRecapped(guildId: string, week: string, now: Date): Promise<void> {
    await (
      await this.col()
    ).updateOne({ _id: guildId }, { $set: { lastRecapWeek: week, updatedAt: now } });
  }

  async exportForOwner(owner: DataOwner) {
    return forExport(await (await this.col()).find({ userId: owner.userId }).toArray());
  }

  /** The server's settings go with the person who made them (the recap was their Plus). */
  async deleteForOwner(owner: DataOwner): Promise<number> {
    return (await (await this.col()).deleteMany({ userId: owner.userId })).deletedCount;
  }
}
