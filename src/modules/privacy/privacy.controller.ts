import "server-only";
import { NextResponse } from "next/server";
import { handler, toNextResponse } from "@/common/http/controller";
import { ServiceResponse } from "@/common/http/service-response";
import { requireUser, SESSION_COOKIE } from "@/modules/identity";
import type { PrivacyService } from "./privacy.service";
import { DeleteAccountSchema, ExportQuerySchema } from "./schemas/privacy.schema";

export class PrivacyController {
  constructor(private readonly deps: { service: PrivacyService }) {}

  /** GET /api/v1/me/export?format=json|matches-csv|mmr-csv: a file download. */
  export = handler(
    {
      guard: requireUser,
      rateLimit: { name: "export", limit: 10, windowMs: 60 * 60_000 },
      query: ExportQuerySchema,
    },
    async ({ user, query }) => {
      const file = await this.deps.service.exportAsFile(
        { userId: user.id, accountId32: user.accountId32 },
        query.format,
      );
      return new NextResponse(file.body, {
        headers: {
          "content-type": `${file.contentType}; charset=utf-8`,
          "content-disposition": `attachment; filename="${file.filename}"`,
          "cache-control": "no-store",
        },
      });
    },
  );

  /** POST /api/v1/me/delete with { confirm: "DELETE" }: deletes the account, signs out. */
  delete = handler({ guard: requireUser, body: DeleteAccountSchema }, async ({ user }) => {
    const deleted = await this.deps.service.deleteAll({
      userId: user.id,
      accountId32: user.accountId32,
    });
    const res = toNextResponse(ServiceResponse.success({ deleted }, "Account deleted"));
    res.cookies.delete(SESSION_COOKIE);
    return res;
  });
}
