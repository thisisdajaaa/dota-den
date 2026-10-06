import { z } from "zod";
import { EXPORT_FORMATS } from "../domain/export-file";

export const ExportQuerySchema = z.object({ format: z.enum(EXPORT_FORMATS).default("json") });

export const DeleteAccountSchema = z.object(
  { confirm: z.literal("DELETE", { error: "Type DELETE to confirm." }) },
  { error: "Type DELETE to confirm." },
);
