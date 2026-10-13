import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "../support/contrast";

// WCAG 1.4.3 / spec 5 and 7: text on the job page's own surfaces needs 4.5:1 in both modes.
const MIN_TEXT_CONTRAST = 4.5;

const tokens = readFileSync(join(process.cwd(), "src/theme/tokens.css"), "utf8");
const jobCss = readFileSync(join(process.cwd(), "src/features/job/job.css"), "utf8");
const contentCss = readFileSync(join(process.cwd(), "src/ui/styles/content.css"), "utf8");

function block(selector: string): string {
  const start = tokens.indexOf(`${selector} {`);
  return tokens.slice(start, tokens.indexOf("\n}", start));
}

function token(scope: string, name: string): string {
  const match = new RegExp(`${name}:\\s*(oklch\\([^)]*\\))`).exec(scope);
  if (!match) throw new Error(`${name} not found`);
  return match[1]!;
}

// Text token on surface token, as the next-step card, the due line and the kicker use them.
const PAIRS = [
  ["--text-2", "--accent-soft"],
  ["--accent-text", "--accent-soft"],
  ["--text-2", "--warn-soft"],
  ["--warn-text", "--warn-soft"],
  ["--warn-text", "--bg"],
  ["--accent-text", "--bg"],
] as const;

describe.each([
  ["light", ":root"],
  ["dark", ':root[data-mode="dark"]'],
])("job page text in %s mode", (_mode, selector) => {
  const scope = block(selector);

  it.each(PAIRS)("%s on %s reaches 4.5:1", (text, surface) => {
    expect(contrastRatio(token(scope, text), token(scope, surface))).toBeGreaterThanOrEqual(
      MIN_TEXT_CONTRAST,
    );
  });
});

// The A4 sheet stays white in both modes, so its text uses the paper tokens (defined once on :root).
describe("A4 sheet", () => {
  const root = block(":root");

  it.each(["--paper-ink", "--paper-muted"])("%s on --paper reaches 4.5:1", (text) => {
    expect(contrastRatio(token(root, text), token(root, "--paper"))).toBeGreaterThanOrEqual(
      MIN_TEXT_CONTRAST,
    );
  });

  it("points the text tokens inside .paper at the paper ink, so controls on it stay readable", () => {
    const paper = /\.paper\s*\{([^}]*)\}/.exec(contentCss)?.[1] ?? "";
    expect(paper).toMatch(/--text:\s*var\(--paper-ink\);/);
    expect(paper).toMatch(/--text-2:\s*var\(--paper-muted\);/);
    expect(paper).toMatch(/--hover:\s*oklch\(0\.2 0\.008 60 \/ 0\.07\);/);
  });
});

describe("job.css", () => {
  it("puts a due warning in dark mode on the amber field, not the vermilion one", () => {
    expect(jobCss).toMatch(
      /:root\[data-mode="dark"\] \.next\.tone-warn\s*\{\s*background:\s*var\(--warn-soft\);/,
    );
  });

  it("keeps the big numeral inside the header rule (negative letter-spacing compensated)", () => {
    expect(jobCss).toMatch(
      /\.jd-score\s*\{[^}]*letter-spacing:\s*-0\.06em;[^}]*padding-right:\s*0\.06em;/,
    );
  });
});
