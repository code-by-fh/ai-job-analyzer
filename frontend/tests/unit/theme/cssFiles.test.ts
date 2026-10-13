import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOTS = ["src", "app"];
const FENCE = /^\s*```/;

function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return cssFiles(path);
    return entry.name.endsWith(".css") ? [path] : [];
  });
}

interface LightningCss {
  transform: (options: { filename: string; code: Uint8Array; errorRecovery: boolean }) => unknown;
}

// lightningcss is the strict parser of the Tailwind v4 toolchain (@tailwindcss/node), so it adds no
// dependency; postcss accepts broken selectors that browsers drop. Resolved along that chain (pnpm).
const requireFrom = (from: string) => createRequire(from);
const tailwindPostcss = requireFrom(import.meta.url).resolve("@tailwindcss/postcss");
const tailwindNode = requireFrom(tailwindPostcss).resolve("@tailwindcss/node");
const lightningcss = requireFrom(tailwindNode)("lightningcss") as LightningCss;

function parseStrict(css: string, filename: string): void {
  lightningcss.transform({ filename, code: new TextEncoder().encode(css), errorRecovery: false });
}

const FILES = ROOTS.flatMap((root) => cssFiles(join(process.cwd(), root))).map((file) =>
  relative(process.cwd(), file),
);

describe("stylesheets parse strictly", () => {
  it("finds the stylesheets", () => {
    expect(FILES.length).toBeGreaterThan(0);
  });

  it("rejects a stylesheet with a broken selector", () => {
    expect(() => parseStrict(".a { color: red } ..b { color: blue }", "x.css")).toThrow(
      /class selector/,
    );
  });

  it("rejects a stray closing brace", () => {
    expect(() => parseStrict(".a { color: red } }", "x.css")).toThrow();
  });

  it.each(FILES)("%s has no markdown fence and parses without error recovery", (file) => {
    const css = readFileSync(join(process.cwd(), file), "utf8");
    const fenced = css.split("\n").findIndex((line) => FENCE.test(line));
    expect(fenced, "markdown fence line").toBe(-1);
    expect(() => parseStrict(css, file)).not.toThrow();
  });
});
