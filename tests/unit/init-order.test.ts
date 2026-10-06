import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it, vi } from "vitest";

// Next bundles each route on its own, so any server file can be the first module loaded.
// With import cycles between modules, that order decides whether a top-level value is read
// before it exists ("Cannot access X before initialization"). Load every route and server
// module first, in a fresh module graph, to catch that before a deploy does.

const ROOT = join(__dirname, "../..");

function walk(dir: string, keep: (path: string) => boolean): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path, keep);
    return keep(path) ? [path] : [];
  });
}

const routes = walk(join(ROOT, "src/app"), (p) => p.endsWith("route.ts"));
const modules = walk(join(ROOT, "src/modules"), (p) => {
  const rel = relative(join(ROOT, "src/modules"), p);
  return p.endsWith(".ts") && !/\/(ui|dtos|schemas)\//.test(`/${rel}`) && !rel.endsWith(".test.ts");
});

describe("module initialisation order", () => {
  it.each([...routes, ...modules].map((p) => [relative(ROOT, p), p]))(
    "%s loads as the first module",
    async (_name, path) => {
      vi.resetModules();
      await expect(import(path)).resolves.toBeDefined();
    },
    30_000,
  );
});
