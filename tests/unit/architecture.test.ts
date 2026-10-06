import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/** Enforces the layer rules in docs/adr/0004-module-boundaries.md. */
const ROOT = join(process.cwd(), "src");
const MODULES = join(ROOT, "modules");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

function importsOf(file: string): string[] {
  const src = readFileSync(file, "utf8");
  const re =
    /(?:import|export)\s[^'"]*?from\s+["']([^"']+)["']|import\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
  return [...src.matchAll(re)].map((m) => m[1] ?? m[2] ?? m[3]);
}

type Layer = "domain" | "application" | "infrastructure" | "ui";
function classify(file: string): { context: string; layer: Layer | "root" } {
  const [context, layer] = relative(MODULES, file).split(sep);
  const known = ["domain", "application", "infrastructure", "ui"];
  return { context, layer: known.includes(layer) ? (layer as Layer) : "root" };
}

/** Resolve relative/aliased imports to "context/layer" when they point into src/modules. */
function target(file: string, spec: string): { context: string; layer: string } | null {
  let abs: string | null = null;
  if (spec.startsWith("@/modules/")) abs = join(MODULES, spec.slice("@/modules/".length));
  else if (spec.startsWith(".")) abs = join(file, "..", spec);
  if (!abs || !abs.startsWith(MODULES)) return null;
  const [context, layer = "root"] = relative(MODULES, abs).split(sep);
  return { context, layer };
}

const FRAMEWORK = [/^next(\/|$)/, /^react(-dom)?(\/|$)/, /^mongodb$/, /^server-only$/];

const files = walk(MODULES).map((f) => ({ file: f, ...classify(f), imports: importsOf(f) }));

function violations(check: (f: (typeof files)[number], spec: string) => string | null): string[] {
  return files.flatMap((f) =>
    f.imports.map((spec) => check(f, spec)).filter((v): v is string => v !== null),
  );
}

describe("architecture boundaries", () => {
  it("finds module files to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("domain imports no framework, database, lib or outer layers", () => {
    const found = violations((f, spec) => {
      if (f.layer !== "domain") return null;
      const rel = relative(ROOT, f.file);
      // Pure code only: the shared Result type is the one common import allowed.
      if (
        FRAMEWORK.some((re) => re.test(spec)) ||
        (spec.startsWith("@/common/") && spec !== "@/common/result")
      )
        return `${rel} → ${spec}`;
      const t = target(f.file, spec);
      if (!t) return null;
      const allowed = t.context === f.context && t.layer === "domain";
      return allowed ? null : `${rel} → ${spec}`;
    });
    expect(found).toEqual([]);
  });

  it("application imports no framework, database or infrastructure", () => {
    const found = violations((f, spec) => {
      if (f.layer !== "application") return null;
      const rel = relative(ROOT, f.file);
      if (FRAMEWORK.some((re) => re.test(spec)) || spec.startsWith("@/common/db"))
        return `${rel} → ${spec}`;
      const t = target(f.file, spec);
      if (!t) return null;
      if (t.layer === "infrastructure" || t.layer === "ui") return `${rel} → ${spec}`;
      // Other contexts only through their public index.
      if (t.context !== f.context && t.layer !== "root") return `${rel} → ${spec}`;
      return null;
    });
    expect(found).toEqual([]);
  });

  it("ui never imports mongodb, infrastructure, db or env", () => {
    const found = violations((f, spec) => {
      if (f.layer !== "ui") return null;
      const rel = relative(ROOT, f.file);
      if (spec === "mongodb" || spec.startsWith("@/common/db") || spec === "@/common/config/env")
        return `${rel} → ${spec}`;
      const t = target(f.file, spec);
      return t?.layer === "infrastructure" ? `${rel} → ${spec}` : null;
    });
    expect(found).toEqual([]);
  });

  it("modules never read another context's infrastructure", () => {
    const found = violations((f, spec) => {
      const t = target(f.file, spec);
      if (!t || t.context === f.context) return null;
      return t.layer === "infrastructure" ? `${relative(ROOT, f.file)} → ${spec}` : null;
    });
    expect(found).toEqual([]);
  });

  it("client components never import server-only modules", () => {
    const clientFiles = walk(ROOT).filter((f) =>
      /^["']use client["']/.test(readFileSync(f, "utf8").trimStart()),
    );
    const found = clientFiles.flatMap((f) =>
      importsOf(f)
        .filter(
          (s) =>
            s === "mongodb" ||
            s.startsWith("@/common/db") ||
            s === "@/common/config/env" ||
            s.endsWith("/composition") ||
            s.includes("/infrastructure/"),
        )
        .map((s) => `${relative(ROOT, f)} → ${s}`),
    );
    expect(found).toEqual([]);
  });
});
