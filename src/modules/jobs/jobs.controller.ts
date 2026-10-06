import "server-only";
import {
  AppError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "@/common/errors/app-error";
import { handler } from "@/common/http/controller";
import { requireCron } from "@/common/http/cron-auth";
import { requestId } from "@/common/http/http";
import { ServiceResponse } from "@/common/http/service-response";
import type { Logger } from "@/common/logging/logger";
import { isJobName } from "./domain/job";
import { JobMessageSchema } from "./schemas/job-message.schema";
import type { CronService } from "./services/cron.service";
import type { JobRunner } from "./services/job-runner.service";

/** Verifies that a request really came from QStash. */
export interface JobSignatureVerifier {
  verify(input: { signature: string; body: string; url: string }): Promise<boolean>;
}

export class JobsController {
  constructor(
    private readonly deps: {
      runner: () => JobRunner;
      cron: CronService;
      /** Null when QStash isn't configured: job delivery then doesn't exist (404). */
      verifier: () => JobSignatureVerifier | null;
      appUrl: () => string;
      logger: Pick<Logger, "info">;
    },
  ) {}

  /**
   * POST /api/jobs/:name: background job delivery from Upstash QStash (ADR 0008). Only signed
   * QStash requests are accepted. A failed job answers 500 so QStash retries it.
   */
  deliver = handler({ sameOrigin: false }, async ({ req }) => {
    const name = req.nextUrl.pathname.split("/").pop() ?? "";
    const verifier = this.deps.verifier();
    if (!verifier || !isJobName(name)) throw new NotFoundError("No such job");
    const body = await req.text();
    const signature = req.headers.get("upstash-signature");
    const url = `${this.deps.appUrl().replace(/\/$/, "")}/api/jobs/${name}`;
    const valid =
      !!signature && (await verifier.verify({ signature, body, url }).catch(() => false));
    if (!valid) throw new UnauthorizedError("Invalid job signature");
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      throw new ValidationError("Body must be JSON");
    }
    const message = JobMessageSchema.safeParse(json);
    if (!message.success) throw new ValidationError("Invalid job message");

    const started = Date.now();
    const outcome = await this.deps.runner().run(name, message.data.payload, message.data.dedupKey);
    this.deps.logger.info("job_run", {
      name,
      status: outcome.status,
      durationMs: Date.now() - started,
    });
    if (outcome.status === "failed")
      throw new AppError("internal", "Job failed; it will be retried");
    return ServiceResponse.success({ status: outcome.status }, "Job ran");
  });

  /** GET /api/cron/matches (Vercel Cron, daily): every player's matches and medal. */
  cronMatches = handler({ guard: requireCron }, async () =>
    ServiceResponse.success(await this.deps.cron.runMatchSync("cron"), "Match sync finished"),
  );

  /** GET /api/cron/patches (Vercel Cron, daily): patches and cached tournament data. */
  cronPatches = handler({ guard: requireCron }, async ({ req }) =>
    ServiceResponse.success(
      await this.deps.cron.runPatchRefresh("cron", requestId(req)),
      "Patch refresh finished",
    ),
  );
}
