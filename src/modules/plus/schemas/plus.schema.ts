import { z } from "zod";
import { PLANS } from "../domain/plans";

/** POST /api/v1/plus/checkout {plan: "monthly" | "yearly"} */
export const CheckoutBodySchema = z.object({ plan: z.enum(PLANS) }).strip();
