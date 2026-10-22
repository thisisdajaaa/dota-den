import { z } from "zod";
import { CHANNEL_ID, CHANNEL_NAME, PLATFORMS } from "../domain/platform";

/** GET /api/v1/live/channels?q=…&live=1 */
export const ChannelSearchQuerySchema = z.object({
  q: z.string().trim().min(2).max(50),
  live: z
    .enum(["1", "0", "true", "false"])
    .optional()
    .transform((v) => v === "1" || v === "true"),
});

/** POST /api/v1/me/streamers */
export const FollowStreamerSchema = z
  .object({
    platform: z.enum(PLATFORMS),
    channelId: z.string().regex(CHANNEL_ID),
    login: z.string(),
    displayName: z.string().trim().min(1).max(50),
  })
  .strict()
  .refine((v) => CHANNEL_NAME[v.platform].test(v.login), {
    path: ["login"],
    message: "Not a channel name on that site",
  });

/** DELETE /api/v1/me/streamers/:platform/:channelId */
export const StreamerParamsSchema = z.object({
  platform: z.enum(PLATFORMS),
  channelId: z.string().regex(CHANNEL_ID),
});
