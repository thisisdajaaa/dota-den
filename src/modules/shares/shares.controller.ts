import "server-only";
import { NotFoundError, ValidationError } from "@/common/errors/app-error";
import { handler } from "@/common/http/controller";
import { getViewerTimeZone } from "@/common/http/request-context";
import { ServiceResponse } from "@/common/http/service-response";
import { requireUser } from "@/modules/identity";
import type { ShareLinkDto } from "./dtos/responses/share.dto";
import { CreateShareSchema, ShareSlugParams } from "./schemas/shares.schema";
import type { ShareDocument } from "./shares.model";
import type { SharesService } from "./services/shares.service";

export class SharesController {
  constructor(private readonly deps: { service: SharesService; appUrl: () => string }) {}

  toDto(doc: ShareDocument): ShareLinkDto {
    return {
      slug: doc._id,
      url: new URL(`/s/${doc._id}`, this.deps.appUrl()).toString(),
      kind: doc.kind,
      ref: doc.ref,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  /** POST /api/v1/me/shares: a link to a session or this week (refreshed if it exists). */
  create = handler(
    {
      guard: requireUser,
      rateLimit: { name: "shares:create", limit: 20, windowMs: 60_000 },
      body: CreateShareSchema,
    },
    async ({ user, body }) => {
      const { timeZone } = await getViewerTimeZone();
      const result = await this.deps.service.share(
        { userId: user.id, accountId32: user.accountId32 },
        body,
        timeZone,
      );
      if (!result.ok) {
        if (result.error.type === "empty")
          throw new ValidationError("There's nothing to share yet.");
        throw new NotFoundError("Session not found");
      }
      return ServiceResponse.success(this.toDto(result.value), "Share link ready");
    },
  );

  /** DELETE /api/v1/me/shares/:slug: the link stops working. */
  revoke = handler(
    {
      guard: requireUser,
      rateLimit: { name: "shares:revoke", limit: 30, windowMs: 60_000 },
      params: ShareSlugParams,
    },
    async ({ user, params }) => {
      if (!(await this.deps.service.revoke(user.id, params.slug)))
        throw new NotFoundError("Share link not found");
      return ServiceResponse.success({ slug: params.slug }, "Share link removed");
    },
  );
}
