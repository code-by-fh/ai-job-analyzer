import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "../support/contrast";

// Spec 4.3 #5: meaningful text is at least 13 px; the design scale names it --fs-13.
const MIN_TEXT_PX = 13;
// WCAG 1.4.3 for normal text (spec 5, SC1).
const MIN_TEXT_CONTRAST = 4.5;
// WCAG 1.4.11 for control boundaries (spec 4.3 #5, SC2).
const MIN_BOUNDARY_CONTRAST = 3;
const css = readFileSync(join(process.cwd(), "src/features/applications/applications.css"), "utf8");
const controls = readFileSync(join(process.cwd(), "src/ui/styles/controls.css"), "utf8");
const tokens = readFileSync(join(process.cwd(), "src/theme/tokens.css"), "utf8");

function fontSizes(): string[] {
  const sizes = [...css.matchAll(/font-size:\s*([^;]+);/g)].map((match) => match[1]!.trim());
  const shorthand = [...css.matchAll(/font:\s*\d+\s+([\d.]+px)\//g)].map((match) => match[1]!);
  return [...sizes, ...shorthand];
}

function isTooSmall(size: string): boolean {
  const px = /^([\d.]+)px$/.exec(size);
  return px ? Number(px[1]) < MIN_TEXT_PX : /--fs-12\b/.test(size);
}

function scope(selector: string): string {
  const start = tokens.indexOf(`${selector} {`);
  return tokens.slice(start, tokens.indexOf("\n}", start));
}

function token(block: string, name: string): string {
  const match = new RegExp(`${name}:\\s*(oklch\\([^)]*\\))`).exec(block);
  if (!match) throw new Error(`${name} not found`);
  return match[1]!;
}

describe("applications.css", () => {
  it("never sets text below 13 px", () => {
    expect(fontSizes().filter(isTooSmall)).toEqual([]);
  });

  it("draws one busy bar: the closed rows under the toggle draw none", () => {
    expect(css).toMatch(
      /\.closed-toggle \.apps-closed\[aria-busy="true"\]::before\s*\{\s*content:\s*none;/,
    );
  });

  it("sets stage colours through one class set, not inline styles", () => {
    expect(css).toMatch(/\.stage-drafted\s*\{\s*--c:\s*var\(--st-drafted\)/);
    expect(css).toMatch(/\.stage-closed\s*\{\s*--c:\s*var\(--st-closed\)/);
  });

  it("gives every strip toggle a control-grade boundary below its stage rule (SC2)", () => {
    expect(css).toMatch(/\.strip-item\s*\{[^}]*border-bottom:\s*1px solid var\(--line-control\)/);
  });

  it("shows kept rows as loading by a bar above them, not by the hover tint or a fade", () => {
    expect(css).toMatch(
      /\.apps-sections\[aria-busy="true"\]::before,\s*\.apps-closed\[aria-busy="true"\]::before\s*\{[^}]*height:\s*2px;[^}]*var\(--text-2\)/,
    );
    expect(css).not.toMatch(/aria-busy="true"\] \.arow/);
    expect(css).not.toMatch(/aria-busy[^{]*\{[^}]*opacity/);
  });

  it("slides the busy bar only when motion is welcome", () => {
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: no-preference\)\s*\{\s*\.apps-sections\[aria-busy="true"\]::before,\s*\.apps-closed\[aria-busy="true"\]::before\s*\{[^}]*animation:/,
    );
  });

  it("gives the closed list the same busy bar as the active list", () => {
    expect(css).toMatch(/\.apps-closed\[aria-busy="true"\]::before\s*\{[^}]*height:\s*2px;/);
  });

  it("shows a static partial segment, not a full-width rule, when motion is reduced", () => {
    expect(css).toMatch(
      /\.apps-closed\[aria-busy="true"\]::before\s*\{[^}]*background-size:\s*30% 100%;/,
    );
  });

  it("lets a long unbroken company name wrap in a row (I1)", () => {
    expect(css).toMatch(/\.arow-sub\s*\{[^}]*overflow-wrap:\s*anywhere;/);
  });

  it("draws the pending strip as invisible ghosts of the strip items (R11)", () => {
    expect(css).toMatch(/\.strip-ghost > \*\s*\{\s*visibility:\s*hidden;/);
    expect(css).not.toMatch(/min-height:\s*161px/);
  });

  it("hides the focus ring of the list only for programmatic focus (D14)", () => {
    expect(css).toMatch(/\.apps-list:focus:not\(:focus-visible\)\s*\{\s*outline:\s*none;/);
  });

  it("colours a warning step amber, never crimson", () => {
    expect(css).toMatch(/\.next-cell\.t-warn\s*\{[^}]*color:\s*var\(--warn-text\)/);
  });
});

describe.each([
  ["light", ":root"],
  ["dark", ':root[data-mode="dark"]'],
])("row text contrast in %s mode (SC1)", (_mode, selector) => {
  const mode = scope(selector);

  // A hovered row keeps its amber step and its muted cells readable.
  it.each([
    ["--warn-text", "--hover"],
    ["--warn-text", "--bg"],
    ["--text-2", "--hover"],
    ["--text-3", "--hover"],
    ["--text-3", "--bg"],
    // A failed generation is crimson text, on a hovered row too.
    ["--danger", "--hover"],
    ["--danger", "--bg"],
  ])("%s on %s reaches 4.5:1", (text, background) => {
    expect(contrastRatio(token(mode, text), token(mode, background))).toBeGreaterThanOrEqual(
      MIN_TEXT_CONTRAST,
    );
  });
});

describe.each([
  ["light", ":root"],
  ["dark", ':root[data-mode="dark"]'],
])("phase strip contrast in %s mode (SC1, SC2)", (_mode, selector) => {
  const mode = scope(selector);

  // A pressed or hovered toggle keeps its label, count and "+n" readable.
  it.each([
    ["--text-2", "--selected"],
    ["--text", "--selected"],
    ["--text-2", "--hover"],
    ["--text-2", "--bg"],
  ])("%s on %s reaches 4.5:1", (text, background) => {
    expect(contrastRatio(token(mode, text), token(mode, background))).toBeGreaterThanOrEqual(
      MIN_TEXT_CONTRAST,
    );
  });

  it.each([
    ["--line-control", "--bg"],
    ["--line-control", "--hover"],
    ["--line-control", "--selected"],
  ])("the toggle boundary %s on %s reaches 3:1", (line, background) => {
    expect(contrastRatio(token(mode, line), token(mode, background))).toBeGreaterThanOrEqual(
      MIN_BOUNDARY_CONTRAST,
    );
  });

  // The search busy bar is a state indicator, a non-text graphic (WCAG 1.4.11).
  it("the busy bar --text-2 on --bg reaches 3:1", () => {
    expect(contrastRatio(token(mode, "--text-2"), token(mode, "--bg"))).toBeGreaterThanOrEqual(
      MIN_BOUNDARY_CONTRAST,
    );
  });
});

describe("controls.css search field", () => {
  const rule = /\.input\[type="search"\]::-webkit-search-cancel-button\s*\{([^}]*)\}/.exec(
    controls,
  )?.[1];

  it("replaces the native clear glyph by a palette-coloured mask", () => {
    expect(rule).toMatch(/appearance:\s*none/);
    expect(rule).toMatch(/background:\s*var\(--text-2\)/);
  });
});
