import { z } from "zod";
import { OPS_JOBS } from "../domain/alert-rules";

/** What the backup and restore-drill workflows POST to /api/cron/backup-report. */
export const OpsReportSchema = z.object({
  job: z.enum(OPS_JOBS),
  ok: z.boolean(),
  details: z.string().trim().max(2_000).default(""),
  /** The workflow run, linked from the admin page: GitHub only. */
  runUrl: z
    .url()
    .max(300)
    .refine((u) => u.startsWith("https://github.com/"), "runUrl must be a GitHub URL")
    .nullish()
    .transform((v) => v ?? null),
});
