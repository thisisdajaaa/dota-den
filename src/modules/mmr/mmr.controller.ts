import "server-only";
import { z } from "zod";
import {
  NotFoundError,
  UpstreamUnavailableError,
  ValidationError,
} from "@/common/errors/app-error";
import { handler } from "@/common/http/controller";
import { ServiceResponse } from "@/common/http/service-response";
import { requireUser } from "@/modules/identity";
import { toMmrEntryDto } from "./dtos/responses/mmr-entry.dto";
import { MmrEntryInputSchema } from "./schemas/mmr-entry.schema";
import type { MmrJournalService } from "./services/mmr-journal.service";
import type { ScreenshotService } from "./services/screenshot.service";

const EntryParams = z.object({ id: z.string().max(64) });
const INVALID = "Check the highlighted fields";

export class MmrController {
  constructor(
    private readonly deps: { journal: MmrJournalService; screenshots: ScreenshotService },
  ) {}

  /** POST /api/v1/mmr-entries: log an MMR you saw, for your current account. */
  create = handler(
    { guard: requireUser, body: MmrEntryInputSchema, invalidMessage: INVALID },
    async ({ user, body }) => {
      const entry = await this.deps.journal.create(
        { userId: user.id, accountId32: user.accountId32 },
        body,
      );
      return ServiceResponse.created(toMmrEntryDto(entry), "MMR saved");
    },
  );

  /** PATCH /api/v1/mmr-entries/:id */
  update = handler(
    { guard: requireUser, params: EntryParams, body: MmrEntryInputSchema, invalidMessage: INVALID },
    async ({ user, params, body }) => {
      const res = await this.deps.journal.update(
        { userId: user.id, accountId32: user.accountId32 },
        params.id,
        body,
      );
      // Someone else's entry is indistinguishable from a missing one.
      if (!res.ok) throw new NotFoundError("Entry not found");
      return ServiceResponse.success(toMmrEntryDto(res.value), "MMR updated");
    },
  );

  /** DELETE /api/v1/mmr-entries/:id */
  remove = handler({ guard: requireUser, params: EntryParams }, async ({ user, params }) => {
    const res = await this.deps.journal.delete(
      { userId: user.id, accountId32: user.accountId32 },
      params.id,
    );
    if (!res.ok) throw new NotFoundError("Entry not found");
    return ServiceResponse.success(null, "Entry deleted");
  });

  /** POST /api/v1/mmr-entries/read-screenshot (multipart, field `image`): a suggestion only. */
  readScreenshot = handler(
    {
      guard: requireUser,
      rateLimit: { name: "mmr-shot", limit: 10, windowMs: 60 * 60_000 },
    },
    async ({ req }) => {
      if (!this.deps.screenshots.available)
        throw new UpstreamUnavailableError("Reading screenshots isn't set up.");
      const form = await req.formData().catch(() => null);
      const file = form?.get("image");
      if (!(file instanceof File)) throw new ValidationError("Attach a screenshot.");
      const read = await this.deps.screenshots.read({
        type: file.type,
        size: file.size,
        bytes: () => file.arrayBuffer(),
      });
      return ServiceResponse.success(read);
    },
  );
}
