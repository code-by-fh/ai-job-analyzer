import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "../support/contrast";

// Spec 5 / preflight ruling 21: the distribution ticks carry meaning, so both fills need 3:1.
const MIN_GRAPHIC_CONTRAST = 3;
const tokens = readFileSync(join(process.cwd(), "src/theme/tokens.css"), "utf8");
const inboxCss = readFileSync(join(process.cwd(), "src/features/inbox/inbox.css"), "utf8");

function scope(selector: string): string {
  const start = tokens.indexOf(`${selector} {`);
  return tokens.slice(start, tokens.indexOf("\n}", start));
}

function token(block: string, name: string): string {
  const match = new RegExp(`${name}:\\s*(oklch\\([^)]*\\))`).exec(block);
  if (!match) throw new Error(`${name} not found`);
  return match[1]!;
}

function ruleValue(rule: string, property: string): string {
  const match = new RegExp(`${rule}\\s*\\{[^}]*${property}:\\s*([^;]+);`).exec(inboxCss);
  if (!match) throw new Error(`${rule} has no ${property}`);
  return match[1]!.trim();
}

function fillToken(rule: string): string {
  const match = /var\((--[\w-]+)\)/.exec(ruleValue(rule, "fill"));
  if (!match) throw new Error(`${rule} has no fill token`);
  return match[1]!;
}

describe.each([
  ["light", ":root"],
  ["dark", ':root[data-mode="dark"]'],
])("threshold ticks in %s mode", (_mode, selector) => {
  const mode = scope(selector);

  it.each([["\\.thr-tick"], ["\\.thr-tick\\.below"], ["\\.thr-line"]])(
    "%s reaches 3:1 against --bg",
    (rule) => {
      const colour = token(mode, fillToken(rule));
      expect(contrastRatio(colour, token(mode, "--bg"))).toBeGreaterThanOrEqual(
        MIN_GRAPHIC_CONTRAST,
      );
    },
  );
});

describe("threshold scale", () => {
  it("labels the scale at 13 px, since 60 Möglich and 80 Stark carry meaning (spec 4.3 #5)", () => {
    expect(ruleValue("\\.thr-scale", "font-size")).toBe("var(--fs-13)");
  });
});
