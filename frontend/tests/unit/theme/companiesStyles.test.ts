import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src/features/companies/companies.css"), "utf8");
const globals = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

describe("companies.css", () => {
  it("is imported after settings.css and lives in the components layer", () => {
    const settings = globals.indexOf('@import "../src/features/settings/settings.css";');
    const companies = globals.indexOf('@import "../src/features/companies/companies.css";');
    expect(settings).toBeGreaterThan(-1);
    expect(companies).toBeGreaterThan(settings);
    expect(css).toMatch(/^[\s\S]*?@layer components\s*{/);
  });

  // 7b ruling 25: meaningful text is at least 13 px; colours and radii come from tokens only.
  it("uses no 12 px text, no unknown radius token and no literal colours", () => {
    expect(css).not.toMatch(/--fs-12\b/);
    expect(css).not.toMatch(/--r-card/);
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(css).not.toMatch(/\b(rgba?|hsla?|oklch)\(/);
  });

  it("lifts the 12 px code to 13 px and gives buttons and checks 44 px", () => {
    expect(css).toMatch(/\.companies \.code\s*{\s*font-size:\s*var\(--fs-13\);/);
    expect(css).toMatch(/\.companies \.btn,\s*\.companies \.seg button\s*{[^}]*min-height:\s*44px/);
    // Phase 8 Q1: the base .check is 44 px at every width, so the page needs no override.
    const controls = readFileSync(join(process.cwd(), "src/ui/styles/controls.css"), "utf8");
    expect(controls).toMatch(/\n\s*\.check\s*{[^}]*align-items:\s*center;[^}]*min-height:\s*44px/);
    expect(css).not.toMatch(/\.companies \.check/);
    expect(css).toMatch(/\.companies \.btn-icon\s*{[^}]*min-width:\s*44px/);
  });

  it("lifts the 12 px small buttons and tags to 13 px", () => {
    expect(css).toMatch(
      /\.companies \.btn-sm,\s*\.companies \.tag\s*{\s*font-size:\s*var\(--fs-13\);/,
    );
  });

  it("gives the company refresh dialog, portalled outside .companies, 44 px buttons", () => {
    const job = readFileSync(join(process.cwd(), "src/features/job/job.css"), "utf8");
    expect(job).toMatch(/\.company-dialog \.btn\s*{[^}]*min-height:\s*44px/);
    expect(job).toMatch(/\.company-dialog \.btn-icon\s*{[^}]*min-width:\s*44px/);
  });

  it("gives the detail's deep dive toggles and job links 44 px", () => {
    expect(css).toMatch(/\.companies \.disclosure\s*{[^}]*min-height:\s*44px/);
    expect(css).toMatch(/\.company-job\s*{[^}]*min-height:\s*44px/);
  });

  it("gives every row 44 px and a 13 px meta line", () => {
    expect(css).toMatch(
      /\.company-list li\s*{[^}]*grid-template-columns:\s*44px minmax\(0, 1fr\);[^}]*min-height:\s*44px/,
    );
    expect(css).toMatch(/\.company-meta\s*{[^}]*font-size:\s*var\(--fs-13\)/);
  });
});
