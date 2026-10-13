import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { describe, expect, it } from "vitest";

const DOMAIN_DIR = join("src", "domain");
// Runtime imports and re-exports between domain modules; `import type` and `export type` are
// erased and cannot form a load cycle. A side-effect import has no `from`.
const DOMAIN_FROM = /^(?:import|export) (?!type )[^;]*?from "(\.\/|@\/domain\/)([\w/-]+)";/gms;
const DOMAIN_SIDE_EFFECT = /^import "(\.\/|@\/domain\/)([\w/-]+)";/gm;
const RELATIVE = "./";

interface Target {
  relative: boolean;
  name: string;
}

function targetsOf(source: string): Target[] {
  return [...source.matchAll(DOMAIN_FROM), ...source.matchAll(DOMAIN_SIDE_EFFECT)].map((match) => ({
    relative: match[1] === RELATIVE,
    name: match[2]!,
  }));
}

function runtimeTargets(source: string): string[] {
  return targetsOf(source).map((target) => target.name);
}

/** Module key: its path below src/domain without ".ts", with "/" separators. */
const moduleKey = (file: string) => file.replace(/\.ts$/, "").split(sep).join("/");

function domainGraph(): Map<string, string[]> {
  // Recursive, so modules in subfolders are read too.
  const files = readdirSync(DOMAIN_DIR, { recursive: true, encoding: "utf8" }).filter((name) =>
    name.endsWith(".ts"),
  );
  return new Map(
    files.map((file) => {
      const folder = dirname(moduleKey(file));
      const resolve = ({ relative, name }: Target) =>
        relative && folder !== "." ? `${folder}/${name}` : name;
      const source = readFileSync(join(DOMAIN_DIR, file), "utf8");
      return [moduleKey(file), targetsOf(source).map(resolve)];
    }),
  );
}

/** Every module that can reach itself again through runtime imports. */
function modulesInCycles(graph: Map<string, string[]>): string[] {
  const reaches = (from: string, target: string, seen: Set<string>): boolean =>
    (graph.get(from) ?? []).some(
      (next) => next === target || (!seen.has(next) && reaches(next, target, seen.add(next))),
    );
  return [...graph.keys()].filter((module) => reaches(module, module, new Set([module])));
}

describe("the import reader", () => {
  it("sees re-exports and side-effect imports, not type-only ones", () => {
    const source = [
      'import { a } from "./alpha";',
      'export { b } from "./beta";',
      'export * from "@/domain/gamma";',
      'import "./delta";',
      'import type { E } from "./epsilon";',
      'export type { F } from "./phi";',
    ].join("\n");
    expect(runtimeTargets(source).sort()).toEqual(["alpha", "beta", "delta", "gamma"]);
  });
});

describe("domain modules", () => {
  it("import each other without a cycle", () => {
    expect(modulesInCycles(domainGraph())).toEqual([]);
  });

  it("the schedule rules need no other domain module", () => {
    expect(domainGraph().get("schedule")).toEqual([]);
  });
});
