import { plusController } from "@/modules/plus";

/** Starts a checkout for {plan} (signed in, same-origin): answers the provider's checkout URL. */
export const POST = plusController.checkout;
