/** Public API of the groups feature (ADR 0009). */
export { groupPageService, groupsController, groupsService } from "./groups.container";
export type {
  GroupDto,
  GroupMemberDto,
  GroupPartyDto,
  GroupSummaryDto,
  InvitePreviewDto,
  MemberHeroesDto,
  WeeklyBoardDto,
} from "./dtos/responses/groups.dto";
