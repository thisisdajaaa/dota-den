import "server-only";
import { handler } from "@/common/http/controller";
import { ServiceResponse } from "@/common/http/service-response";
import { requireUser } from "@/modules/identity";
import { toStreamerFollowDto } from "./dtos/responses/streamers.dto";
import type { LiveService } from "./live.service";
import {
  ChannelSearchQuerySchema,
  FollowStreamerSchema,
  StreamerParamsSchema,
} from "./schemas/streamers.schema";
import { streamerOwnerOf, type StreamerFollowService } from "./streamer-follows.service";

/** Channel searches per caller (user or IP) per minute: typing is debounced client-side. */
const CHANNEL_SEARCH = { name: "live:channel-search", limit: 30, windowMs: 60_000 };
/** Follow/unfollow requests per user per minute. */
const STREAMER_MUTATIONS = { name: "live:streamer-follows", limit: 60, windowMs: 60_000 };

export class LiveController {
  constructor(private readonly deps: { live: LiveService; follows: StreamerFollowService }) {}

  /** GET /api/v1/live/channels?q=…&live=1: channels by name on every site, live ones first. */
  searchChannels = handler(
    { rateLimit: CHANNEL_SEARCH, query: ChannelSearchQuerySchema },
    async ({ query }) => {
      const channels = await this.deps.live.searchChannels(query.q, query.live);
      return ServiceResponse.success({ channels }).withHeaders({
        "cache-control": "public, max-age=60",
      });
    },
  );

  /** GET /api/v1/me/streamers: your followed channels, live first. */
  listFollows = handler({ guard: requireUser }, async ({ user }) => {
    const owner = streamerOwnerOf(user);
    const [channels, limit] = await Promise.all([
      this.deps.follows.following(owner),
      this.deps.follows.limit(owner),
    ]);
    return ServiceResponse.success({ channels, limit }).withHeaders({
      "cache-control": "private, no-store",
    });
  });

  /** POST /api/v1/me/streamers: follow a channel. 201 when new, 200 when already followed. */
  follow = handler(
    {
      guard: requireUser,
      rateLimit: STREAMER_MUTATIONS,
      body: FollowStreamerSchema,
      invalidMessage: "Invalid channel",
    },
    async ({ user, body }) => {
      const { follow, created } = await this.deps.follows.follow(streamerOwnerOf(user), body);
      const dto = toStreamerFollowDto(follow);
      return created
        ? ServiceResponse.created(dto, "Following")
        : ServiceResponse.success(dto, "Already following");
    },
  );

  /** DELETE /api/v1/me/streamers/:platform/:channelId: stop following. Idempotent. */
  unfollow = handler(
    { guard: requireUser, rateLimit: STREAMER_MUTATIONS, params: StreamerParamsSchema },
    async ({ user, params }) => {
      await this.deps.follows.unfollow(streamerOwnerOf(user), params.platform, params.channelId);
      return ServiceResponse.success(null, "Unfollowed");
    },
  );
}
