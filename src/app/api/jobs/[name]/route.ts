import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError } from "@/common/http/http";
import { env } from "@/common/config/env";
import { logger } from "@/common/logging/logger";
import { isJobName } from "@/modules/jobs/domain/job";
import { getJobReceiver, getJobRunner } from "@/modules/jobs/composition";

const MessageSchema = z.object({
  payload: z.record(z.string(), z.unknown()).default({}),
  dedupKey: z.string().max(200).nullable().default(null),
});

/**
 * Background job delivery from Upstash QStash (ADR 0008). Only signed QStash requests are
 * accepted; without QStash configured this route doesn't exist (404). A failed job answers
 * 500 so QStash retries it.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ name: string }> },
): Promise<NextResponse> {
  const { name } = await ctx.params;
  const receiver = getJobReceiver();
  if (!receiver || !isJobName(name)) return apiError("not_found", "No such job");

  const body = await req.text();
  const signature = req.headers.get("upstash-signature");
  const url = `${env().APP_URL.replace(/\/$/, "")}/api/jobs/${name}`;
  const valid = !!signature && (await receiver.verify({ signature, body, url }).catch(() => false));
  if (!valid) return apiError("unauthorized", "Invalid job signature");

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return apiError("bad_request", "Body must be JSON");
  }
  const message = MessageSchema.safeParse(json);
  if (!message.success) return apiError("bad_request", "Invalid job message");

  const started = Date.now();
  const outcome = await (
    await getJobRunner()
  ).run(name, message.data.payload, message.data.dedupKey);
  logger.info("job_run", { name, status: outcome.status, durationMs: Date.now() - started });
  if (outcome.status === "failed") return apiError("internal", "Job failed; it will be retried");
  return NextResponse.json({ status: outcome.status });
}
