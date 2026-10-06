/** Public API of the drafts feature (ADR 0009). Snapshot and draft rules live in ./domain. */
export {
  draftHistoryRepository,
  draftHistoryService,
  draftInsights,
  draftMetaCacheRepository,
  draftRecordService,
  draftRoomService,
  draftRoomsController,
  draftRoomsRepository,
  draftsController,
  draftsPrivacy,
  getAiOpponent,
  getChallengeService,
  getDraftHeroes,
} from "./drafts.container";
export type { DraftRecordView } from "./dtos/responses/draft-record.dto";
export type { RoomView, EventView } from "./dtos/responses/room-views.dto";
