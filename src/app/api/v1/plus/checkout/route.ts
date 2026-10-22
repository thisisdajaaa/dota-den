import { plusController } from "@/modules/plus";

/** Redirects a signed-in player to the provider's checkout for ?plan=monthly|yearly. */
export const GET = plusController.checkout;
