import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "../support/contrast";

const css = readFileSync(join(process.cwd(), "src/features/sources/sources.css"), "utf8");
const tokens = readFileSync(join(process.cwd(), "src/theme/tokens.css"), "utf8");

// WCAG 1.4.3: the failing banner's source buttons are links (--accent-text) on the error notice.
const MIN_TEXT_CONTRAST = 4.5;

function tokenBlock(selector: string): string {
  const start = tokens.indexOf(`${selector} {`);
  return tokens.slice(start, tokens.indexOf("\n}", start));
}

function token(scope: string, name: string): string {
  const match = new RegExp(`${name}:\\s*(oklch\\([^)]*\\))`).exec(scope);
  if (!match) throw new Error(`${name} not found`);
  return match[1]!;
}

// Preflight R-7: shared primitives below 13 px, lifted inside the Quellen page, drawer and wizard.
const LIFTED_PRIMITIVES = [".hint", ".btn-sm", ".chip", ".code"];
const SOURCE_SCOPES = [".sources", ".source-drawer", ".source-wizard"];

function ruleBody(selector: string): string {
  const start = css.indexOf(selector);
  return start < 0 ? "" : css.slice(css.indexOf("{", start), css.indexOf("}", start));
}

describe("sources.css", () => {
  it("lays the rows out by the width of the main column, not the viewport", () => {
    expect(css).toMatch(/container:\s*sources\s*\/\s*inline-size/);
    expect(css).toMatch(/@container sources \(max-width: 719px\)/);
    expect(css).not.toMatch(/@media/);
  });

  it("uses no text size below 13 px", () => {
    expect(css).not.toMatch(/--fs-12\b/);
    expect(
      [...css.matchAll(/font-size:\s*(\d+)px/g)].every((match) => Number(match[1]) >= 13),
    ).toBe(true);
  });

  it("gives touch targets 44 px in the narrow layout", () => {
    expect(css).toMatch(/min-height:\s*44px/);
  });

  // Ruling R14 (h): DrawerSection's Speichern is a 28 px small button in the narrow drawer too.
  it("gives the drawer sections' Speichern 44 px in the narrow drawer", () => {
    const narrow = css.slice(css.indexOf("@container source-drawer (max-width: 719px)"));
    expect(narrow).toMatch(/\.drawer-section-foot \.btn[,\s][^{]*{[^}]*min-height:\s*44px/);
  });

  it("lifts the 12 px primitives to 13 px inside the page, the drawer and the wizard", () => {
    const selector = SOURCE_SCOPES.flatMap((scope) =>
      LIFTED_PRIMITIVES.map((primitive) => `${scope} ${primitive}`),
    ).join(",\n  ");
    expect(css).toContain(selector);
    expect(ruleBody(selector)).toMatch(/font-size:\s*var\(--fs-13\)/);
  });

  it("uses only design tokens that exist, without fallback values", () => {
    const used = [...css.matchAll(/var\((--[\w-]+)([,)])/g)];
    expect(used.filter((match) => match[2] === ",")).toEqual([]);
    expect(used.map((match) => match[1]).filter((name) => !tokens.includes(`${name}:`))).toEqual(
      [],
    );
  });
});

describe.each([
  ["light", ":root"],
  ["dark", ':root[data-mode="dark"]'],
])("banner links in %s mode", (_mode, selector) => {
  it("--accent-text on the error notice (--danger-soft) reaches 4.5:1", () => {
    const scope = tokenBlock(selector);
    expect(
      contrastRatio(token(scope, "--accent-text"), token(scope, "--danger-soft")),
    ).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
  });
});
