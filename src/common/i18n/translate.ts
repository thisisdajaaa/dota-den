/**
 * Message lookup (pure, safe in client code). Keys are dot paths into the English messages,
 * checked at compile time; `{name}` placeholders are filled from `vars`.
 */

type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

/** Same shape as the English messages, every leaf a string. */
export type MessageTree<T> = { [K in keyof T]: T[K] extends string ? string : MessageTree<T[K]> };

export type Translator<T> = (key: Leaves<T>, vars?: Record<string, string | number>) => string;

export function translator<T>(messages: MessageTree<T>, fallback: MessageTree<T>): Translator<T> {
  const lookup = (tree: unknown, key: string): string | undefined => {
    let node = tree;
    for (const part of key.split(".")) {
      if (node === null || typeof node !== "object") return undefined;
      node = (node as Record<string, unknown>)[part];
    }
    return typeof node === "string" ? node : undefined;
  };
  return (key, vars) => {
    const text = lookup(messages, key) ?? lookup(fallback, key) ?? key;
    return vars
      ? text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m))
      : text;
  };
}

/**
 * Count phrases: messages store `{ one: "1 game", other: "{n} games" }` under `key`; pick by n.
 * Filipino and Cebuano usually use the same text for both.
 */
export function plural<T>(t: Translator<T>, key: string, n: number): string {
  return t(`${key}.${n === 1 ? "one" : "other"}` as never, { n: n.toLocaleString("en-US") });
}
