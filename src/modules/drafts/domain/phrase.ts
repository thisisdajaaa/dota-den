/**
 * Text the UI shows in the viewer's language (pure). Domain code can't translate, so next to
 * an English sentence (used by the language model and as a fallback) it returns a phrase: a
 * message id under `drafts.phrases` and the values to fill in. A value can be a phrase itself
 * (translated first) or a list of phrases (translated and joined with ", "). With `count`, the
 * message has `one` and `other` forms and `{n}` is the count.
 */
export interface Phrase {
  id: string;
  vars?: Readonly<Record<string, PhraseValue>>;
  count?: number;
}

export type PhraseValue = string | number | Phrase | readonly Phrase[];

export function phrase(id: string, vars?: Record<string, PhraseValue>, count?: number): Phrase {
  return {
    id,
    ...(vars ? { vars } : {}),
    ...(count === undefined ? {} : { count }),
  };
}
