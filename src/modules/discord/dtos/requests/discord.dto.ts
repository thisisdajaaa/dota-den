import type { z } from "zod";
import type {
  ConnectWebhookSchema,
  FeedSettingsSchema,
  NudgeSettingsSchema,
} from "../../schemas/discord.schema";

export type ConnectWebhookDto = z.infer<typeof ConnectWebhookSchema>;
export type FeedSettingsDto = z.infer<typeof FeedSettingsSchema>;
export type NudgeSettingsDto = z.infer<typeof NudgeSettingsSchema>;
