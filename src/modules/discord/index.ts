/** Public API of the Discord feed feature (ADR 0009). */
export {
  discordController,
  discordFeedService,
  discordPostLogRepository,
  discordWebhookService,
  discordWebhooksRepository,
} from "./discord.container";
export type {
  DiscordRunDto,
  DiscordStatusDto,
  FeedPostResultDto,
} from "./dtos/responses/discord-status.dto";
