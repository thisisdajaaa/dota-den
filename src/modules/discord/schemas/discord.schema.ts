import { z } from "zod";

/** The pasted webhook URL; the controller checks it is really a Discord webhook. */
export const ConnectWebhookSchema = z.object({ url: z.string().trim().min(1).max(300) }).strict();

export const FeedSettingsSchema = z.object({ enabled: z.boolean() }).strict();

/** From the account page: by DM or off (a server channel is chosen with /den nudges there). */
export const NudgeSettingsSchema = z.object({ where: z.enum(["off", "dm"]) }).strict();
