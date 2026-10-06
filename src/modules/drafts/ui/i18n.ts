import type { Messages } from "@/common/i18n/messages";
import type { Translator } from "@/common/i18n/translate";
import type { Phrase } from "../domain/phrase";
import type { Position } from "../domain/draft-positions";
import type { Side } from "../domain/draft-state";

/** Helpers that turn draft ids and domain phrases into the viewer's language. */
export type T = Translator<Messages>;

/** Translate a domain phrase (see `domain/phrase.ts`); nested phrases are translated first. */
export function say(t: T, p: Phrase): string {
  const vars: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(p.vars ?? {})) {
    vars[k] =
      typeof v === "object"
        ? Array.isArray(v)
          ? (v as readonly Phrase[]).map((x) => say(t, x)).join(", ")
          : say(t, v as Phrase)
        : v;
  }
  if (p.count !== undefined) {
    vars.n = p.count.toLocaleString("en-US");
    return t(`drafts.phrases.${p.id}.${p.count === 1 ? "one" : "other"}` as never, vars);
  }
  return t(`drafts.phrases.${p.id}` as never, vars);
}

/** A phrase when the data has one (older cached data may not), else the English text. */
export function sayOr(t: T, p: Phrase | null | undefined, english: string): string {
  return p ? say(t, p) : english;
}

export const sideName = (t: T, s: Side) => t(`drafts.phrases.side.${s}`);

export const positionName = (t: T, p: Position) => t(`drafts.phrases.position.pos${p}`);

export const roleName = (t: T, r: "core" | "support") => t(`drafts.phrases.role.${r}`);

export const actionName = (t: T, a: "pick" | "ban") => t(`drafts.actions.${a}`);

/** A ruleset's name and description by id (unknown ids keep the English text). */
export function rulesetName(t: T, r: { id: string; name: string }): string {
  return r.id === "cm-2026" || r.id === "practice-simple"
    ? t(`drafts.rulesets.${r.id}.name`)
    : r.name;
}

export function rulesetDescription(t: T, r: { id: string; description: string }): string {
  return r.id === "cm-2026" || r.id === "practice-simple"
    ? t(`drafts.rulesets.${r.id}.description`)
    : r.description;
}

/** Turn time like "25s" or "1:05". */
export function seconds(t: T, ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return s >= 60
    ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
    : t("drafts.board.secondsShort", { s });
}
