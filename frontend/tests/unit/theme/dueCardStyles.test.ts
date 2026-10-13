import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "../support/contrast";

// Spec 5: graphics that carry meaning (the border of a due row) need 3:1 against the page.
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

function borderToken(rule: string): string {
  const match = new RegExp(
    `${rule}\\s*\\{[^}]*border-left(?:-color)?:[^;]*var\\((--[\\w-]+)\\)`,
  ).exec(inboxCss);
  if (!match) throw new Error(`${rule} has no border colour token`);
  return match[1]!;
}

describe.each([
  ["light", ":root"],
  ["dark", ':root[data-mode="dark"]'],
])(".due-row border in %s mode", (_mode, selector) => {
  const mode = scope(selector);

  it.each([[".due-row"], [".due-row.is-warning"]])("%s reaches 3:1 against --bg", (rule) => {
    const colour = token(mode, borderToken(rule.replaceAll(".", "\\.")));
    expect(contrastRatio(colour, token(mode, "--bg"))).toBeGreaterThanOrEqual(MIN_GRAPHIC_CONTRAST);
  });
});
