import type { Locale } from "../locales";
import type { MessageTree } from "../translate";
import { messages as ceb } from "./ceb";
import { messages as en } from "./en";
import { messages as fil } from "./fil";

/** The English messages define every key; the other languages must match their shape. */
export type Messages = typeof en;

const fil_: MessageTree<Messages> = fil;
const ceb_: MessageTree<Messages> = ceb;

export const MESSAGES: Record<Locale, MessageTree<Messages>> = { en, fil: fil_, ceb: ceb_ };
export { en as englishMessages };
