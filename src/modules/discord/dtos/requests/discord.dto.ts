import type { z } from "zod";
import type { ConnectWebhookSchema, FeedSettingsSchema } from "../../schemas/discord.schema";

export type ConnectWebhookDto = z.infer<typeof ConnectWebhookSchema>;
export type FeedSettingsDto = z.infer<typeof FeedSettingsSchema>;
