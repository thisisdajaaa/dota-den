import "server-only";
import { z } from "zod";
import { ConflictError, ValidationError } from "@/common/errors/app-error";
import { handler } from "@/common/http/controller";
import { ServiceResponse } from "@/common/http/service-response";
import { requireUser } from "@/modules/identity";
import { MAX_FOLLOWS_PER_USER } from "./domain/follow";
import { parseAccountId } from "./domain/player-lookup";
import { toFollowDto } from "./dtos/responses/follows.dto";
import { FollowInputSchema } from "./schemas/follows.schema";
import { ownerOf, type FollowService } from "./services/follow.service";

/** Track/untrack requests allowed per user per minute. */
const FOLLOW_MUTATIONS = { name: "follows", limit: 60, windowMs: 60_000 };

export class PlayersController {
  constructor(private readonly deps: { follows: FollowService }) {}

  /** GET /api/v1/me/follows: your tracked players, most recently added first. */
  listFollows = handler({ guard: requireUser }, async ({ user }) => {
    const follows = await this.deps.follows.list(ownerOf(user));
    return ServiceResponse.success({
      follows: follows.map(toFollowDto),
      limit: MAX_FOLLOWS_PER_USER,
    }).withHeaders({ "cache-control": "private, no-store" });
  });

  /** POST /api/v1/me/follows: track a player. 201 when newly tracked, 200 when already. */
  follow = handler(
    {
      guard: requireUser,
      rateLimit: FOLLOW_MUTATIONS,
      body: FollowInputSchema,
      invalidMessage: "Invalid body",
    },
    async ({ user, body }) => {
      const result = await this.deps.follows.follow(ownerOf(user), body.accountId32);
      if (!result.ok) {
        switch (result.error.type) {
          case "self":
            throw new ValidationError("That's your own account");
          case "invalid_account":
            throw new ValidationError("Invalid account id");
          case "limit_reached":
            throw new ConflictError(
              `You can track up to ${result.error.limit} players. Untrack someone first.`,
              { limit: result.error.limit },
            );
        }
      }
      const dto = toFollowDto(result.value.follow);
      return result.value.created
        ? ServiceResponse.created(dto, "Tracking")
        : ServiceResponse.success(dto, "Already tracking");
    },
  );

  /** DELETE /api/v1/me/follows/:accountId: stop tracking. Idempotent. */
  unfollow = handler(
    {
      guard: requireUser,
      rateLimit: FOLLOW_MUTATIONS,
      params: z.object({ accountId: z.string() }),
    },
    async ({ user, params }) => {
      const accountId32 = parseAccountId(params.accountId);
      if (accountId32 === null) throw new ValidationError("Invalid account id");
      await this.deps.follows.unfollow(ownerOf(user), accountId32);
      return ServiceResponse.success(null, "Stopped tracking");
    },
  );
}
