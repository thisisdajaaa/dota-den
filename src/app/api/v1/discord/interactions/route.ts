import { discordController } from "@/modules/discord";

/** Slow commands (coach, Ask Den, pick) finish after the "thinking…" reply, within this. */
export const maxDuration = 60;

export const POST = discordController.interactions;
