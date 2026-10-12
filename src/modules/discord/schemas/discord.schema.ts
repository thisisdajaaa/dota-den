import { z } from "zod";

/** The pasted webhook URL; the controller checks it is really a Discord webhook. */
export const ConnectWebhookSchema = z.object({ url: z.string().trim().min(1).max(300) }).strict();

export const FeedSettingsSchema = z.object({ enabled: z.boolean() }).strict();
