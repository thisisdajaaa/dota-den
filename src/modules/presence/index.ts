/** Public API of the presence feature (ADR 0009): friends playing Dota 2 now. */
export { presenceController, presenceService } from "./presence.container";
export type { FriendsPlayingDto, PlayingFriendDto } from "./dtos/responses/friends-playing.dto";
