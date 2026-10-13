import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "../support/contrast";

// WCAG 1.4.11 and spec 4.3 #5: borders that identify an interactive control need 3:1.
const MIN_CONTROL_CONTRAST = 3;
const SURFACES = ["--surface", "--bg", "--field", "--raised"] as const;

const css = readFileSync(join(process.cwd(), "src/theme/tokens.css"), "utf8");
const controlsCss = readFileSync(join(process.cwd(), "src/ui/styles/controls.css"), "utf8");

function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  return css.slice(start, css.indexOf("\n}", start));
}

function token(scope: string, name: string): string {
  const match = new RegExp(`${name}:\\s*(oklch\\([^)]*\\))`).exec(scope);
  if (!match) throw new Error(`${name} not found`);
  return match[1]!;
}

describe.each([
  ["light", ":root"],
  ["dark", ':root[data-mode="dark"]'],
])("--line-control in %s mode", (_mode, selector) => {
  const scope = block(selector);
  const rootScope = block(":root");

  it.each(SURFACES)("reaches 3:1 against %s", (surface) => {
    const background = token(surface in scopeTokens(scope) ? scope : rootScope, surface);
    expect(contrastRatio(token(scope, "--line-control"), background)).toBeGreaterThanOrEqual(
      MIN_CONTROL_CONTRAST,
    );
  });
});

describe(".tag", () => {
  it("is static, so it keeps the hairline border instead of the control border", () => {
    expect(controlsCss).toMatch(/\.tag\s*\{[^}]*border:\s*1px solid var\(--line\);/);
  });
});

function scopeTokens(scope: string): Record<string, true> {
  return Object.fromEntries([...scope.matchAll(/(--[\w-]+):/g)].map((m) => [m[1]!, true as const]));
}
