import { reportController } from "@/modules/report";

/** Up to two model calls (an answer and one retry), each with its own time limit. */
export const maxDuration = 60;

export const POST = reportController.read;
