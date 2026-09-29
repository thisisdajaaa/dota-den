import { createHash } from "node:crypto";

/** JSON with object keys sorted recursively, so equal content always serializes equally. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, sortKeys((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

/** SHA-256 (hex) of the canonical JSON of an upstream payload. */
export function contentHash(payload: unknown): string {
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}
