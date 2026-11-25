import { plusController } from "@/modules/plus";

/** The signed-in friend claims an invite link (same-origin): a week of Plus each. */
export const POST = plusController.claimReferral;
