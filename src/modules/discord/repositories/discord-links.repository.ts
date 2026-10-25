import "server-only";
import type { Db } from "mongodb";
import { forExport, type DataOwner } from "@/common/privacy/user-data";
import { DISCORD_COLLECTIONS, type DiscordLinkDocument } from "../discord.model";
import type { DiscordLink, DiscordLinksPort } from "../discord.ports";

const toLink = (d: DiscordLinkDocument): DiscordLink => ({
  discordId: d._id,
  userId: d.userId,
  accountId32: d.accountId32,
  username: d.username,
  globalName: d.globalName,
  avatar: d.avatar,
  guilds: d.guilds,
  linkedAt: d.linkedAt,
});

/** Linked Discord accounts: one per Dota Den user and one per Discord user. */
export class DiscordLinksRepository implements DiscordLinksPort {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async col() {
    return (await this.getDb()).collection<DiscordLinkDocument>(DISCORD_COLLECTIONS.links);
  }

  async ensureIndexes(): Promise<void> {
    const col = await this.col();
    await Promise.all([
      col.createIndex({ userId: 1 }, { unique: true, name: "uniq_user" }),
      col.createIndex({ guilds: 1 }, { name: "by_guild" }),
    ]);
  }

  async forUser(userId: string): Promise<DiscordLink | null> {
    const d = await (await this.col()).findOne({ userId });
    return d ? toLink(d) : null;
  }

  async forDiscord(discordId: string): Promise<DiscordLink | null> {
    const d = await (await this.col()).findOne({ _id: discordId });
    return d ? toLink(d) : null;
  }

  async inGuild(guildId: string, limit: number): Promise<DiscordLink[]> {
    return (await (await this.col()).find({ guilds: guildId }).limit(limit).toArray()).map(toLink);
  }

  /**
   * Links the accounts, replacing any earlier link of either side (a Discord account belongs
   * to one Dota Den account at a time, and the other way round).
   */
  async link(input: Omit<DiscordLink, "guilds" | "linkedAt">, now: Date): Promise<void> {
    const col = await this.col();
    await col.deleteMany({ userId: input.userId, _id: { $ne: input.discordId } });
    await col.updateOne(
      { _id: input.discordId },
      {
        $set: {
          userId: input.userId,
          accountId32: input.accountId32,
          username: input.username,
          globalName: input.globalName,
          avatar: input.avatar,
          updatedAt: now,
        },
        $setOnInsert: { guilds: [], linkedAt: now },
      },
      { upsert: true },
    );
  }

  async rememberGuild(discordId: string, guildId: string): Promise<void> {
    await (await this.col()).updateOne({ _id: discordId }, { $addToSet: { guilds: guildId } });
  }

  async unlink(userId: string): Promise<boolean> {
    return (await (await this.col()).deleteOne({ userId })).deletedCount === 1;
  }

  async exportForOwner(owner: DataOwner) {
    return forExport(await (await this.col()).find({ userId: owner.userId }).toArray());
  }

  async deleteForOwner(owner: DataOwner): Promise<number> {
    return (await (await this.col()).deleteMany({ userId: owner.userId })).deletedCount;
  }
}
