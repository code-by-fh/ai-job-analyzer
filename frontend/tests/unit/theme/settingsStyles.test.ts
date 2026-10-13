import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src/features/settings/settings.css"), "utf8");
const SEG_QUERY = "@container settings (max-width: 719px)";
const COLUMN_QUERY = "@container settings (max-width: 479px)";
const desktop = css.slice(0, css.indexOf(SEG_QUERY));
const seg = css.slice(css.indexOf(SEG_QUERY), css.indexOf(COLUMN_QUERY));
const column = css.slice(css.indexOf(COLUMN_QUERY));

describe("settings.css", () => {
  it("lays the pane out by the main column, not the viewport", () => {
    expect(css).toMatch(/container:\s*settings\s*\/\s*inline-size/);
    expect(css).toContain(SEG_QUERY);
    expect(css).toContain(COLUMN_QUERY);
    expect(css).not.toMatch(/@media/);
  });

  it("uses no text size below 13 px, no hard-coded z-index and only existing tokens", () => {
    expect(css).not.toMatch(/--fs-12\b/);
    expect(css).not.toMatch(/z-index/);
    expect(css).not.toMatch(/--r-card/);
  });

  // Preflight ruling 17: colours come from tokens only.
  it("uses no literal colours", () => {
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(css).not.toMatch(/\b(rgba?|hsla?|oklch)\(/);
  });

  // Preflight ruling 17: dialogs portal outside .settings, so their panels lift the 12 px primitives too.
  it("lifts the 12 px primitives to 13 px on the page and in its dialogs", () => {
    expect(css).toMatch(
      /\.settings \.hint,\s*\.settings \.btn-sm,\s*\.settings \.seg button,\s*\.settings \.tag,\s*\.settings \.code,\s*\.settings-dialog \.hint,\s*\.settings-dialog \.btn-sm\s*{\s*font-size:\s*var\(--fs-13\);/,
    );
  });

  it("gives the sub-nav links 44 px at every width", () => {
    expect(desktop).toMatch(/\.settings-nav a\s*{[^}]*min-height:\s*44px/);
    expect(seg).not.toMatch(/min-height:\s*(?!44px)\d/);
    expect(column).not.toMatch(/min-height:\s*(?!44px)\d/);
  });

  // R4 and preflight ruling 17: every button in the pane and its dialogs is a touch target at every width.
  it("gives pane and dialog buttons 44 px at every width", () => {
    expect(desktop).toMatch(
      /\.settings-pane \.btn,\s*\.settings-pane \.seg button,\s*\.settings-dialog \.btn\s*{[^}]*min-height:\s*44px/,
    );
    expect(desktop).toMatch(
      /\.settings-pane \.btn-icon,\s*\.settings-dialog \.btn-icon\s*{[^}]*min-width:\s*44px/,
    );
  });

  // Preflight ruling 49: the factory reset's zone is framed in crimson with the panel radius.
  it("frames the danger zone with the danger token and the panel radius", () => {
    expect(css).toMatch(
      /\.danger-zone\s*{[^}]*border:\s*1px solid var\(--danger\);[^}]*border-radius:\s*var\(--r-panel\)/,
    );
    expect(css).toMatch(/\.danger-zone h3\s*{[^}]*color:\s*var\(--danger\)/);
  });

  // Preflight ruling 18: "Benachrichtigungen" does not fit a third of 343 px, so the seg stacks.
  it("stacks the sub-nav in one column of rows below 480 px", () => {
    expect(column).toMatch(/\.settings-nav ul\s*{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
    expect(column).toMatch(/border-top:\s*1px solid var\(--line-control\)/);
    expect(column).toMatch(/\.settings-nav li \+ li a\s*{[^}]*border-left:\s*0/);
  });

  // 7b ruling 17: the admin group keeps its three short links in one seg row below 480 px.
  it("keeps the admin links a three-column row below 480 px", () => {
    expect(column).toMatch(
      /\.settings-nav ul\[aria-labelledby\]\s*{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/,
    );
    expect(desktop).toMatch(/\.settings-nav-group\s*{[^}]*font-size:\s*var\(--fs-13\)/);
  });

  // Preflight ruling 22: a task row stacks below 480 px; the override must follow the base rule.
  it("stacks a routing row below 480 px, after its two-column base rule", () => {
    const base = css.search(/\.routing-row\s*{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto/);
    const stacked = css.search(
      /@container settings \(max-width: 479px\)\s*{\s*\.routing-row\s*{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/,
    );
    expect(base).toBeGreaterThan(-1);
    expect(stacked).toBeGreaterThan(base);
  });
});
