import { z } from "zod";

export const VisibilitySchema = z
  .object({ profileVisibility: z.enum(["private", "friends", "public"]) })
  .strict();
