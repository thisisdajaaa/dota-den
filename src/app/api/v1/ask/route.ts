import { assistantController } from "@/modules/assistant";

/** A question can take a few model calls (tools, the answer, one retry), each time-limited. */
export const maxDuration = 60;

export const GET = assistantController.state;
export const POST = assistantController.ask;
export const DELETE = assistantController.clear;
