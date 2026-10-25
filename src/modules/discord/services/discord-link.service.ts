import { randomBytes, timingSafeEqual } from "node:crypto";
import type { DataOwner } from "@/common/privacy/user-data";
import type { DiscordIdentity, DiscordLinksPort } from "../discord.ports";

import type { DiscordLinkStatus } from "../dtos/responses/discord-link.dto";
export type { DiscordLinkStatus };

const avatarUrl = (id: string, avatar: string | null) =>
  avatar ? `https://cdn.discordapp.com/avatars/${id}/${avatar}.png?size=64` : null;

/**
 * Linking a Dota Den account to a Discord account (so the bot knows who's who). Discord's
 * OAuth2 with the `identify` scope only: we learn the Discord id and name, nothing else.
 */
export class DiscordLinkService {
  constructor(
    private readonly deps: {
      oauth: {
        authorizeUrl(state: string): string;
        identify(code: string): Promise<DiscordIdentity | null>;
      } | null;
      links: DiscordLinksPort;
      now?: () => Date;
    },
  ) {}

  get enabled(): boolean {
    return this.deps.oauth !== null;
  }

  /** Where to send the player, and the state to keep in a cookie until they come back. */
  begin(): { url: string; state: string } | null {
    if (!this.deps.oauth) return null;
    const state = randomBytes(24).toString("base64url");
    return { url: this.deps.oauth.authorizeUrl(state), state };
  }

  /** Back from Discord: checks the state, asks Discord who it is, and links the accounts. */
  async finish(
    user: { id: string; accountId32: number },
    input: { code: string | null; state: string | null; cookieState: string | null },
  ): Promise<"linked" | "denied" | "bad_state" | "off"> {
    const oauth = this.deps.oauth;
    if (!oauth) return "off";
    if (!input.state || !input.cookieState || !sameString(input.state, input.cookieState))
      return "bad_state";
    if (!input.code) return "denied";
    const who = await oauth.identify(input.code).catch(() => null);
    if (!who) return "denied";
    await this.deps.links.link(
      {
        discordId: who.id,
        userId: user.id,
        accountId32: user.accountId32,
        username: who.username,
        globalName: who.globalName,
        avatar: who.avatar,
      },
      this.deps.now?.() ?? new Date(),
    );
    return "linked";
  }

  async status(userId: string): Promise<DiscordLinkStatus> {
    const link = await this.deps.links.forUser(userId);
    return {
      enabled: this.enabled,
      linked: link
        ? {
            username: link.username,
            globalName: link.globalName,
            avatarUrl: avatarUrl(link.discordId, link.avatar),
          }
        : null,
    };
  }

  unlink(userId: string): Promise<boolean> {
    return this.deps.links.unlink(userId);
  }

  async exportMyData(owner: DataOwner) {
    return { discordLinks: await this.deps.links.exportForOwner(owner) };
  }

  async deleteMyData(owner: DataOwner) {
    return { discordLinks: await this.deps.links.deleteForOwner(owner) };
  }
}

function sameString(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
