import { z } from "zod";
import {
  GROUP_ID_PATTERN,
  INVITE_TOKEN_PATTERN,
  MAX_GROUP_NAME,
  MIN_GROUP_NAME,
  normaliseGroupName,
} from "../domain/group";

export const GroupNameSchema = z
  .string()
  .transform(normaliseGroupName)
  .pipe(z.string().min(MIN_GROUP_NAME).max(MAX_GROUP_NAME));

export const CreateGroupSchema = z.object({ name: GroupNameSchema }).strict();
export const RenameGroupSchema = z.object({ name: GroupNameSchema }).strict();
export const JoinGroupSchema = z.object({ token: z.string().regex(INVITE_TOKEN_PATTERN) }).strict();

export const GroupIdParams = z.object({ id: z.string().regex(GROUP_ID_PATTERN) });
export const GroupMemberParams = z.object({
  id: z.string().regex(GROUP_ID_PATTERN),
  accountId: z.coerce.number().int().positive().max(4_294_967_295),
});
export const InviteTokenParams = z.object({ token: z.string().regex(INVITE_TOKEN_PATTERN) });
