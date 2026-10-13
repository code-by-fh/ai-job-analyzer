import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "../support/contrast";

// Spec 4.3: meaningful meta text is at least 13px; WCAG 1.4.3: text needs 4.5:1.
const MIN_FONT_PX = 13;
const MIN_TEXT_CONTRAST = 4.5;
const shellCss = readFileSync(join(process.cwd(), "src/features/shell/shell.css"), "utf8");
const baseCss = readFileSync(join(process.cwd(), "src/theme/base.css"), "utf8");
const tokens = readFileSync(join(process.cwd(), "src/theme/tokens.css"), "utf8");

function tokenIn(scopeStart: number, name: string): string {
  const match = new RegExp(`${name}:\\s*(oklch\\([^)]*\\))`).exec(tokens.slice(scopeStart));
  if (!match) throw new Error(`${name} not found`);
  return match[1]!;
}

describe("shell.css", () => {
  it("declares no font size below 13px", () => {
    const sizes = [...shellCss.matchAll(/font(?:-size)?:[^;]*?\b(\d+(?:\.\d+)?)px/g)].map((m) =>
      Number(m[1]),
    );
    expect(sizes.length).toBeGreaterThan(0);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(MIN_FONT_PX);
  });

  it("draws the bottom-bar error pill in --sb-danger with an ink icon", () => {
    expect(shellCss).toMatch(
      /\.bb-item \.count-badge-danger\s*\{[^}]*background:\s*var\(--sb-danger\);[^}]*color:\s*var\(--sb-bg\);/,
    );
  });

  it("lets the sidebar scroll on short viewports", () => {
    expect(shellCss).toMatch(/\.sidebar\s*\{[^}]*overflow-y:\s*auto/);
  });
});

describe("sidebar count pills", () => {
  it("are 13 px, right-aligned in one column and 8 px from the label", () => {
    expect(shellCss).toMatch(
      /\.nav a \.count-badge,\s*\.nav a \.count-plain\s*\{[^}]*justify-self:\s*end;[^}]*margin-inline-start:\s*4px;/,
    );
    expect(shellCss).toMatch(/\.nav a \.count-badge\s*\{[^}]*font-size:\s*var\(--fs-13\)/);
    expect(shellCss).toMatch(/\.nav-label\s*\{[^}]*font:\s*600 23px/);
  });
});

describe("base.css", () => {
  it("has a 13px meta class next to .small", () => {
    expect(baseCss).toMatch(
      /\.small\s*\{[^}]*\}\s*(?:\/\*[^*]*\*\/\s*)?\.meta\s*\{[^}]*font-size:\s*var\(--fs-13\)/,
    );
  });
});

describe.each([
  ["light", tokens.indexOf(":root {")],
  ["dark", tokens.indexOf(':root[data-mode="dark"] {')],
])("--sb-danger in %s mode", (_mode, start) => {
  it("reads on the sidebar background at 4.5:1", () => {
    const background = tokenIn(start, "--sb-bg");
    const scope = tokens.slice(start);
    const danger =
      /--sb-danger:\s*(oklch\([^)]*\))/.exec(scope)?.[1] ??
      tokenIn(tokens.indexOf(":root {"), "--sb-danger");
    expect(contrastRatio(danger, background)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
  });
});

describe.each([
  ["light", tokens.indexOf(":root {")],
  ["dark", tokens.indexOf(':root[data-mode="dark"] {')],
])("neutral due pill in %s mode", (_mode, start) => {
  const tokenOf = (name: string) =>
    new RegExp(`${name}:\\s*(oklch\\([^)]*\\))`).exec(tokens.slice(start))?.[1] ??
    tokenIn(tokens.indexOf(":root {"), name);

  it("draws the pill in --sb-text with --sb-bg numerals, on the sidebar and the bottom bar", () => {
    expect(shellCss).toMatch(
      /\.nav a \.count-badge-neutral,\s*\.bb-item \.count-badge-neutral\s*\{[^}]*background:\s*var\(--sb-text\);[^}]*color:\s*var\(--sb-bg\);/,
    );
  });

  it("keeps the numerals at 4.5:1 on the pill (the same ratio as the pill on the bar)", () => {
    const [pill, bar] = [tokenOf("--sb-text"), tokenOf("--sb-bg")];
    expect(contrastRatio(bar, pill)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
  });
});
