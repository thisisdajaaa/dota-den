import { z } from "zod";
import { PLANS } from "../domain/plans";

/** POST /api/v1/plus/checkout {plan: "monthly" | "yearly"} */
export const CheckoutBodySchema = z.object({ plan: z.enum(PLANS) }).strip();

/** POST /api/v1/plus/referrals/claim {code}: checked against the code format in the service. */
export const ReferralClaimBodySchema = z.object({ code: z.string().max(32) }).strip();
