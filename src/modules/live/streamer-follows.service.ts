import { ConflictError, NotFoundError } from "@/common/errors/app-error";
import {
  followingRow,
  MAX_STREAMER_FOLLOWS,
  type FollowedChannel,
  type StreamerFollow,
} from "./domain/streams";
import type { Platform } from "./domain/platform";
import type { StreamDirectory, StreamerFollowsPort } from "./live.ports";
import type { FollowStreamerInput } from "./dtos/requests/follow-streamer.dto";

/** The signed-in user who follows channels (any object with the user's id and account). */
export interface StreamerOwner {
  userId: string;
  accountId32: number;
}

export function streamerOwnerOf(user: { id: string; accountId32: number }): StreamerOwner {
  return { userId: user.id, accountId32: user.accountId32 };
}

/** Following channels on any streaming site: the "Following" row on /live. */
export class StreamerFollowService {
  private readonly now: () => Date;

  constructor(
    private readonly deps: {
      repository: StreamerFollowsPort;
      /** Every configured site, to check channels and ask who is live. */
      directories: readonly StreamDirectory[];
      now?: () => Date;
      /** A fixed cap (tests); otherwise `limitFor`, else MAX_STREAMER_FOLLOWS. */
      limit?: number;
      /** The player's cap: Plus doubles it (ADR 0013). */
      limitFor?: (userId: string, base: number) => Promise<number>;
      /** Needed for "Download your data" and account deletion only. */
      data?: {
        exportForOwner(owner: StreamerOwner): Promise<Record<string, unknown>[]>;
        deleteForOwner(owner: StreamerOwner): Promise<number>;
      };
    },
  ) {
    this.now = deps.now ?? (() => new Date());
  }

  /** How many channels this player may follow. */
  async limit(owner: StreamerOwner): Promise<number> {
    if (this.deps.limit !== undefined) return this.deps.limit;
    return this.deps.limitFor
      ? this.deps.limitFor(owner.userId, MAX_STREAMER_FOLLOWS)
      : MAX_STREAMER_FOLLOWS;
  }

  /**
   * Follow a channel. Idempotent: following it again returns `created: false` (and refreshes
   * its names). The names come from the site when it answers; the request's are only a
   * fallback for when it's down (or not set up), and a channel the site says doesn't exist is
   * refused.
   */
  async follow(
    owner: StreamerOwner,
    input: FollowStreamerInput,
  ): Promise<{ follow: StreamerFollow; created: boolean }> {
    const existing = await this.deps.repository.find(owner.userId, input.platform, input.channelId);
    if (!existing) {
      const limit = await this.limit(owner);
      if ((await this.deps.repository.count(owner.userId)) >= limit)
        throw new ConflictError(`You can follow up to ${limit} channels. Unfollow one first.`, {
          limit,
        });
    }

    const directory = this.directory(input.platform);
    const lookup = directory
      ? await directory
          .channelById(input.channelId)
          .catch(() => ({ status: "unavailable" }) as const)
      : ({ status: "unavailable" } as const);
    if (lookup.status === "not_found") throw new NotFoundError("No such channel");
    const channel =
      lookup.status === "found"
        ? lookup.channel
        : {
            login: input.login.toLowerCase(),
            displayName: input.displayName,
            avatarUrl: existing?.avatarUrl ?? null,
          };

    const follow: StreamerFollow = {
      userId: owner.userId,
      platform: input.platform,
      channelId: input.channelId,
      login: channel.login.toLowerCase(),
      displayName: channel.displayName,
      avatarUrl: channel.avatarUrl,
      createdAt: existing?.createdAt ?? this.now(),
    };
    const created = await this.deps.repository.add(follow);
    return { follow, created };
  }

  /** Stop following. Idempotent: `false` when the channel wasn't followed. */
  unfollow(owner: StreamerOwner, platform: Platform, channelId: string): Promise<boolean> {
    return this.deps.repository.remove(owner.userId, platform, channelId);
  }

  list(owner: StreamerOwner): Promise<StreamerFollow[]> {
    return this.deps.repository.list(owner.userId);
  }

  /**
   * The followed channels with who is live (one request per site for up to 100). When a site
   * can't be asked, its channels' status is `unknown`, never offline.
   */
  async following(owner: StreamerOwner): Promise<FollowedChannel[]> {
    const follows = await this.list(owner);
    if (follows.length === 0) return [];
    const platforms = [...new Set(follows.map((f) => f.platform))];
    const live = Object.fromEntries(
      await Promise.all(
        platforms.map(async (p) => {
          const directory = this.directory(p);
          const channels = follows.filter((f) => f.platform === p).map((f) => f.login);
          const found = directory
            ? await directory.liveByChannels(channels).catch(() => null)
            : null;
          return [p, found] as const;
        }),
      ),
    );
    return followingRow(follows, live);
  }

  private directory(platform: Platform): StreamDirectory | undefined {
    return this.deps.directories.find((d) => d.platform === platform);
  }

  async exportMyData(owner: StreamerOwner) {
    return { followedStreamers: (await this.deps.data?.exportForOwner(owner)) ?? [] };
  }

  async deleteMyData(owner: StreamerOwner) {
    return { followedStreamers: (await this.deps.data?.deleteForOwner(owner)) ?? 0 };
  }
}
