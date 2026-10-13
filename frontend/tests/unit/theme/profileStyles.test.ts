import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src/features/profile/profile.css"), "utf8");
const MOBILE_QUERY = "@container profile (max-width: 719px)";
const desktop = css.slice(0, css.indexOf(MOBILE_QUERY));
const mobile = css.slice(css.indexOf(MOBILE_QUERY));

describe("profile.css", () => {
  it("lays the pane out by the main column, not the viewport", () => {
    expect(css).toMatch(/container:\s*profile\s*\/\s*inline-size/);
    expect(css).toContain(MOBILE_QUERY);
    expect(css).not.toMatch(/@media/);
  });

  it("uses no text size below 13 px and no hard-coded z-index", () => {
    expect(css).not.toMatch(/--fs-12\b/);
    expect(css).not.toMatch(/z-index/);
  });

  // Preflight ruling 13: the shared primitives are 12 px; the page and its dialogs lift them.
  it("lifts the 12 px primitives to 13 px on the page and in its dialogs", () => {
    expect(css).toMatch(
      /\.profile \.hint,\s*\.profile \.btn-sm,\s*\.profile \.seg button,\s*\.profile \.tag,\s*\.profile-dialog \.hint,\s*\.profile-dialog \.btn-sm\s*{\s*font-size:\s*var\(--fs-13\);/,
    );
  });

  // Preflight ruling 34: the column can be 720 px wide on a viewport below 768 px.
  it("gives the sub-nav links 44 px at every width", () => {
    expect(desktop).toMatch(/\.profile-nav a\s*{[^}]*min-height:\s*44px/);
    expect(mobile).toMatch(/\.profile-nav a\s*{[^}]*min-height:\s*44px/);
  });

  // Fix round M7: the same holds for the entry and Nachweis buttons and the upload control.
  it("gives entry, Nachweis and upload buttons 44 px at every width", () => {
    expect(desktop).toMatch(
      /\.entry-list \.btn,\s*\.proof-list \.btn-sm\s*{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px/,
    );
    expect(desktop).toMatch(
      /\.proof-upload \.btn-sm,\s*\.proof-upload \.seg button\s*{[^}]*min-height:\s*44px/,
    );
  });

  // Ruling R14 (e): the list headings (h4) sit below the form heading (h3, .sec-title-sm 17 px).
  it("sets the h4 list headings smaller than the h3 form heading", () => {
    expect(desktop).toMatch(/\.entry-list-head \.sec-title-sm\s*{[^}]*font-size:\s*var\(--fs-14\)/);
  });

  // Ruling R14 (h), R16 (b): the section's Speichern is a 28 px small button; a touch target needs
  // 44 px at every width, scoped to the page so the Sources drawer keeps its own rule.
  it("gives the section's Speichern 44 px at every width, on the profile page only", () => {
    expect(desktop).toMatch(
      /\.profile \.drawer-section-foot \.btn,\s*\.profile \.cv-draft-kept \.btn\s*{[^}]*min-height:\s*44px/,
    );
    expect(css).not.toMatch(/(^|[,{}]\s*)\.drawer-section-foot \.btn/);
  });

  // Ruling R16 (b): the chip remove button is a touch target at every width too.
  it("gives the chip remove button 44 px at every width, on the profile page only", () => {
    expect(desktop).toMatch(/\.profile \.chip-remove\s*{[^}]*width:\s*44px;[^}]*height:\s*44px/);
    expect(mobile).not.toMatch(/\.chip-remove/);
  });

  // Global Constraints, Accessibility: the template card buttons are touch targets.
  it("gives the template card buttons 44 px at every width", () => {
    expect(desktop).toMatch(/\.tpl \.btn-sm\s*{[^}]*min-height:\s*44px/);
    expect(desktop).toMatch(/\.tpl \.btn-sm\.btn-icon\s*{[^}]*min-width:\s*44px/);
  });

  // Preflight ruling 33 and D9: tokens only; the default outline is ink, not the accent.
  it("draws the template thumbnails with tokens and the default in ink", () => {
    expect(css).not.toMatch(/--shadow-ink/);
    expect(desktop).toMatch(
      /\.tpl\.is-default \.tpl-thumb\s*{[^}]*outline:\s*3px solid var\(--text\)/,
    );
  });
});
