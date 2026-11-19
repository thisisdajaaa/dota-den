import "server-only";
import { handler } from "@/common/http/controller";
import { ServiceResponse } from "@/common/http/service-response";
import { getLocale } from "@/common/i18n/server";
import { requireUser } from "@/modules/identity";
import {
  CreateGroupSchema,
  GroupIdParams,
  GroupMemberParams,
  JoinGroupSchema,
  PlanDiscordSchema,
  PlanQuerySchema,
  RenameGroupSchema,
} from "./schemas/groups.schema";
import type { GroupsService } from "./services/groups.service";
import type { StackPlannerService } from "./services/stack-planner.service";

const WRITE_LIMIT = { limit: 30, windowMs: 60_000 };

export class GroupsController {
  constructor(private readonly deps: { service: GroupsService; planner: StackPlannerService }) {}

  /** GET /api/v1/groups/:id/planner?members=1,2,3: tonight's lineup for those members. */
  plan = handler(
    {
      guard: requireUser,
      rateLimit: { name: "groups:planner", limit: 20, windowMs: 60_000 },
      params: GroupIdParams,
      query: PlanQuerySchema,
    },
    async ({ user, params, query }) => {
      const group = await this.deps.service.forMember(user, params.id);
      return ServiceResponse.success(await this.deps.planner.plan(user, group, query.members));
    },
  );

  /** POST /api/v1/groups/:id/planner/discord: post the plan to your Discord channel (Plus). */
  postPlan = handler(
    {
      guard: requireUser,
      rateLimit: { name: "groups:planner:discord", limit: 5, windowMs: 60_000 },
      params: GroupIdParams,
      body: PlanDiscordSchema,
      invalidMessage: "Pick 2 to 5 members",
    },
    async ({ user, params, body }) => {
      const group = await this.deps.service.forMember(user, params.id);
      const locale = user.settings.language ?? (await getLocale());
      return ServiceResponse.success(
        await this.deps.planner.postToDiscord(user, group, body.members, locale),
        "Posted to Discord",
      );
    },
  );

  /** GET /api/v1/groups: the groups you're in. */
  list = handler({ guard: requireUser }, async ({ user }) =>
    ServiceResponse.success(await this.deps.service.listMine(user)),
  );

  /** POST /api/v1/groups: create a group (you're its owner). */
  create = handler(
    {
      guard: requireUser,
      rateLimit: { name: "groups:create", limit: 10, windowMs: 60_000 },
      body: CreateGroupSchema,
      invalidMessage: "Invalid group name",
    },
    async ({ user, body }) =>
      ServiceResponse.created(await this.deps.service.create(user, body.name), "Group created"),
  );

  /** PATCH /api/v1/groups/:id: rename (owner only). */
  rename = handler(
    {
      guard: requireUser,
      rateLimit: { name: "groups:write", ...WRITE_LIMIT },
      params: GroupIdParams,
      body: RenameGroupSchema,
      invalidMessage: "Invalid group name",
    },
    async ({ user, params, body }) =>
      ServiceResponse.success(
        await this.deps.service.rename(user, params.id, body.name),
        "Group renamed",
      ),
  );

  /** DELETE /api/v1/groups/:id: delete the group (owner only). */
  remove = handler(
    {
      guard: requireUser,
      rateLimit: { name: "groups:write", ...WRITE_LIMIT },
      params: GroupIdParams,
    },
    async ({ user, params }) => {
      await this.deps.service.delete(user, params.id);
      return ServiceResponse.success({ id: params.id }, "Group deleted");
    },
  );

  /** POST /api/v1/groups/:id/invite: a new invite link; the old one stops working (owner only). */
  resetInvite = handler(
    {
      guard: requireUser,
      rateLimit: { name: "groups:write", ...WRITE_LIMIT },
      params: GroupIdParams,
    },
    async ({ user, params }) =>
      ServiceResponse.success(
        await this.deps.service.resetInvite(user, params.id),
        "Invite link reset",
      ),
  );

  /** POST /api/v1/groups/join: join with an invite token. */
  join = handler(
    {
      guard: requireUser,
      rateLimit: { name: "groups:join", limit: 20, windowMs: 60_000 },
      body: JoinGroupSchema,
      invalidMessage: "Invalid invite link",
    },
    async ({ user, body }) =>
      ServiceResponse.success(await this.deps.service.join(user, body.token), "Joined the group"),
  );

  /** POST /api/v1/groups/:id/leave: leave (an owner hands the group to the next member). */
  leave = handler(
    {
      guard: requireUser,
      rateLimit: { name: "groups:write", ...WRITE_LIMIT },
      params: GroupIdParams,
    },
    async ({ user, params }) =>
      ServiceResponse.success(await this.deps.service.leave(user, params.id), "Left the group"),
  );

  /** DELETE /api/v1/groups/:id/members/:accountId: remove a member (owner only). */
  removeMember = handler(
    {
      guard: requireUser,
      rateLimit: { name: "groups:write", ...WRITE_LIMIT },
      params: GroupMemberParams,
    },
    async ({ user, params }) => {
      await this.deps.service.removeMember(user, params.id, params.accountId);
      return ServiceResponse.success({ accountId32: params.accountId }, "Member removed");
    },
  );
}
