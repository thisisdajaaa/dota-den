import { z } from "zod";
import {
  GROUP_ID_PATTERN,
  INVITE_TOKEN_PATTERN,
  MAX_GROUP_NAME,
  MIN_GROUP_NAME,
  normaliseGroupName,
} from "../domain/group";
import { MAX_STACK, MIN_STACK } from "../domain/stack-planner";

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

const AccountId = z.number().int().positive().max(4_294_967_295);
const StackMembers = z
  .array(AccountId)
  .min(MIN_STACK)
  .max(MAX_STACK)
  .refine((ids) => new Set(ids).size === ids.length, "Each member once");

/** `?members=1,2,3`: the account ids of who's in tonight. */
export const PlanQuerySchema = z.object({
  members: z
    .string()
    .max(80)
    .regex(/^\d+(,\d+)*$/)
    .transform((s) => s.split(",").map(Number))
    .pipe(StackMembers),
});
export const PlanDiscordSchema = z.object({ members: StackMembers }).strict();
