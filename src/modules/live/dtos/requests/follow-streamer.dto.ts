import type { z } from "zod";
import type {
  ChannelSearchQuerySchema,
  FollowStreamerSchema,
} from "../../schemas/streamers.schema";

export type FollowStreamerInput = z.infer<typeof FollowStreamerSchema>;
export type ChannelSearchQuery = z.infer<typeof ChannelSearchQuerySchema>;
