import type { z } from "zod";
import type {
  CreateGroupSchema,
  JoinGroupSchema,
  RenameGroupSchema,
} from "../../schemas/groups.schema";

export type CreateGroupDto = z.infer<typeof CreateGroupSchema>;
export type RenameGroupDto = z.infer<typeof RenameGroupSchema>;
export type JoinGroupDto = z.infer<typeof JoinGroupSchema>;
