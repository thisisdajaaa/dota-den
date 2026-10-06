import { z } from "zod";
import { LOCALES } from "@/common/i18n/locales";

export const LanguageSchema = z.object({ language: z.enum(LOCALES) }).strict();
