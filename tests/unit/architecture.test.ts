import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Enforces docs/adr/0009-feature-module-anatomy.md: every feature has `<name>.container.ts`,
 * and each file's role (controller / service / repository / model / ui …) decides what it
 * may import.
 */
const ROOT = join(process.cwd(), "src");
const MODULES = join(ROOT, "modules");
const APP = join(ROOT, "app");

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

const isClient = (file: string) =>
  /^["']use client["']/.test(readFileSync(file, "utf8").trimStart());

const FRAMEWORK = [/^next(\/|$)/, /^react(-dom)?(\/|$)/, /^mongodb$/, /^server-only$/];
const isFramework = (spec: string) => FRAMEWORK.some((re) => re.test(spec));
/** Pure shared code that domain logic may use. */
const isPureCommon = (spec: string) =>
  spec === "@/common/result" ||
  spec.startsWith("@/common/time/") ||
  spec.startsWith("@/common/utils/");

const features = readdirSync(MODULES).filter((n) => statSync(join(MODULES, n)).isDirectory());
const migrated = new Set(features.filter((f) => existsSync(join(MODULES, f, `${f}.container.ts`))));

type Role =
  | "domain"
  | "model"
  | "ports"
  | "schema"
  | "dto"
  | "service"
  | "repository"
  | "controller"
  | "container"
  | "index"
  | "infrastructure"
  | "ui"
  | "application"
  | "composition"
  | "other";

/** A file's role from its path inside its feature folder. */
function roleOf(rest: string[]): Role {
  const [first] = rest;
  const name = rest[rest.length - 1];
  if (first === "domain") return "domain";
  if (first === "ui") return "ui";
  if (first === "infrastructure") return "infrastructure";
  if (first === "application") return "application";
  if (first === "schemas") return "schema";
  if (first === "dtos") return "dto";
  if (/^index\.tsx?$/.test(name)) return "index";
  if (/^composition\.tsx?$/.test(name)) return "composition";
  for (const role of [
    "model",
    "ports",
    "service",
    "repository",
    "controller",
    "container",
  ] as const)
    if (name.endsWith(`.${role}.ts`)) return role;
  return "other";
}

/** Where an import points inside src/modules, if it does. */
function target(file: string, spec: string): { feature: string; role: Role } | null {
  let abs: string | null = null;
  if (spec.startsWith("@/modules/")) abs = join(MODULES, spec.slice("@/modules/".length));
  else if (spec.startsWith(".")) abs = join(file, "..", spec);
  if (!abs || !abs.startsWith(MODULES)) return null;
  const [feature, ...rest] = relative(MODULES, abs).split(sep);
  if (rest.length === 0) return { feature, role: "index" };
  // Import specifiers have no extension.
  rest[rest.length - 1] = `${rest[rest.length - 1].replace(/\.tsx?$/, "")}.ts`;
  return { feature, role: roleOf(rest) };
}

const moduleFiles = walk(MODULES).map((file) => {
  const [feature, ...rest] = relative(MODULES, file).split(sep);
  return { file, feature, role: roleOf(rest), imports: importsOf(file) };
});
type ModuleFile = (typeof moduleFiles)[number];

function violations(
  files: readonly ModuleFile[],
  check: (f: ModuleFile, spec: string) => boolean,
): string[] {
  return files.flatMap((f) =>
    f.imports.filter((spec) => check(f, spec)).map((s) => `${relative(ROOT, f.file)} → ${s}`),
  );
}

const inMigrated = moduleFiles.filter((f) => migrated.has(f.feature));
/** The role of an import into the file's own feature, or null for anything else. */
const ownRole = (f: ModuleFile, spec: string): Role | null => {
  const t = target(f.file, spec);
  return t && t.feature === f.feature ? t.role : null;
};

describe("architecture: shared code", () => {
  it("finds files to check", () => {
    expect(moduleFiles.length).toBeGreaterThan(0);
    // Every feature follows ADR 0009 (a <feature>.container.ts wires it).
    expect(features.filter((f) => !migrated.has(f))).toEqual([]);
  });

  it("src/common never depends on a feature or the app", () => {
    const found = walk(join(ROOT, "common")).flatMap((f) =>
      importsOf(f)
        .filter((s) => s.startsWith("@/modules/") || s.startsWith("@/app/"))
        .map((s) => `${relative(ROOT, f)} → ${s}`),
    );
    expect(found).toEqual([]);
  });

  it("pure common code (result, time, utils, errors) has no framework or I/O imports", () => {
    const pure = ["result.ts", "time", "utils", "errors"].flatMap((p) => {
      const full = join(ROOT, "common", p);
      return statSync(full).isDirectory() ? walk(full) : [full];
    });
    const found = pure.flatMap((f) =>
      importsOf(f)
        .filter((s) => isFramework(s) || /^@\/common\/(db|config|cache|http|providers)/.test(s))
        .map((s) => `${relative(ROOT, f)} → ${s}`),
    );
    expect(found).toEqual([]);
  });
});

describe("architecture: all features", () => {
  it("domain code is pure: no framework, I/O or outer layers", () => {
    const found = violations(moduleFiles, (f, spec) => {
      if (f.role !== "domain") return false;
      if (isFramework(spec)) return true;
      if (spec.startsWith("@/common/")) return !isPureCommon(spec);
      const t = target(f.file, spec);
      // Its own domain, or another feature's (pure) domain.
      return t !== null && t.role !== "domain";
    });
    expect(found).toEqual([]);
  });

  it("features reach each other only through index, domain or ui", () => {
    const found = violations(moduleFiles, (f, spec) => {
      const t = target(f.file, spec);
      if (!t || t.feature === f.feature) return false;
      return !(t.role === "index" || t.role === "domain" || t.role === "ui");
    });
    expect(found).toEqual([]);
  });

  it("client components never import server code", () => {
    const found = walk(ROOT)
      .filter(isClient)
      .flatMap((f) =>
        importsOf(f)
          .filter((s) => {
            if (s === "mongodb" || s === "server-only") return true;
            if (/^@\/common\/(db|config|cache|providers)/.test(s)) return true;
            if (s === "@/common/http/controller" || s === "@/common/http/request-context")
              return true;
            if (s.includes("/infrastructure/")) return true;
            const t = target(f, s);
            return (
              t !== null &&
              ["index", "composition", "container", "repository", "service", "controller"].includes(
                t.role,
              )
            );
          })
          .map((s) => `${relative(ROOT, f)} → ${s}`),
      );
    expect(found).toEqual([]);
  });
});

describe("architecture: migrated features (ADR 0009 roles)", () => {
  const rule = (roles: Role[], bad: (spec: string, own: Role | null) => boolean) =>
    violations(inMigrated, (f, spec) => roles.includes(f.role) && bad(spec, ownRole(f, spec)));

  it("models, ports, schemas and DTOs are plain types and validation", () => {
    expect(
      rule(
        ["model", "ports", "schema", "dto"],
        (spec, own) =>
          (isFramework(spec) && spec !== "mongodb") ||
          spec.startsWith("@/common/db") ||
          (own !== null && !["domain", "model", "ports", "schema", "dto"].includes(own)),
      ),
    ).toEqual([]);
  });

  it("services hold use cases: no HTTP, database or concrete repositories", () => {
    expect(
      rule(
        ["service"],
        (spec, own) =>
          isFramework(spec) ||
          /^@\/common\/(db|http|config|cache|providers)/.test(spec) ||
          (own !== null &&
            ["repository", "controller", "container", "ui", "infrastructure"].includes(own)),
      ),
    ).toEqual([]);
  });

  it("repositories only persist: no HTTP, services or controllers", () => {
    expect(
      rule(
        ["repository"],
        (spec, own) =>
          /^next(\/|$)/.test(spec) ||
          spec.startsWith("@/common/http") ||
          (own !== null && ["service", "controller", "container", "ui"].includes(own)),
      ),
    ).toEqual([]);
  });

  it("controllers do HTTP only: no database or repositories", () => {
    expect(
      rule(
        ["controller"],
        (spec, own) =>
          spec === "mongodb" ||
          spec.startsWith("@/common/db") ||
          (own !== null && ["repository", "container", "ui", "infrastructure"].includes(own)),
      ),
    ).toEqual([]);
  });

  it("ui never imports server code from its own feature", () => {
    expect(
      rule(
        ["ui"],
        (spec, own) =>
          spec === "mongodb" ||
          /^@\/common\/(db|config|cache|providers)/.test(spec) ||
          (own !== null &&
            [
              "service",
              "repository",
              "controller",
              "container",
              "index",
              "infrastructure",
            ].includes(own)),
      ),
    ).toEqual([]);
  });

  it("have no leftover ADR 0004 application layer or composition.ts", () => {
    const found = inMigrated
      .filter((f) => f.role === "application" || f.role === "composition")
      .map((f) => relative(ROOT, f.file));
    expect(found).toEqual([]);
  });
});

describe("architecture: app routes and pages", () => {
  it("never touch the database or a migrated feature's internals", () => {
    const found = walk(APP).flatMap((f) =>
      importsOf(f)
        .filter((s) => {
          if (s === "mongodb") return true;
          // The health check pings the database on purpose.
          if (s.startsWith("@/common/db")) return !f.endsWith(join("api", "health", "route.ts"));
          const t = target(f, s);
          if (!t || !migrated.has(t.feature)) return false;
          // Pages may parse their URL with a feature's schemas.
          return !["index", "domain", "ui", "dto", "model", "schema"].includes(t.role);
        })
        .map((s) => `${relative(ROOT, f)} → ${s}`),
    );
    expect(found).toEqual([]);
  });
});
