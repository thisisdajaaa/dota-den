/** Public API of the players feature (ADR 0009). */
export {
  followService,
  followsRepository,
  playerDirectory,
  playersController,
  playersService,
} from "./players.container";
export { TRACKED_PAGE_SIZE, type PublicPlayerView } from "./services/players.service";
export { ownerOf } from "./services/follow.service";
export type {
  TrackedPlayersPage,
  TrackedPlayerView,
  FollowDto,
} from "./dtos/responses/follows.dto";
export type { FollowOwner } from "./dtos/responses/players.dto";
export type { ProviderError as PlayerProviderError } from "./players.ports";
