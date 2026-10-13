import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Spec 4.3 #5: meaningful meta text is at least 13px.
const MIN_FONT_PX = 13;
const INBOX_DIR = join(process.cwd(), "src/features/inbox");
const inboxCss = readFileSync(join(INBOX_DIR, "inbox.css"), "utf8");
const inboxComponents = readdirSync(INBOX_DIR, { recursive: true, encoding: "utf8" })
  .filter((file) => file.endsWith(".tsx"))
  .map((file) => ({ file, source: readFileSync(join(INBOX_DIR, file), "utf8") }));

describe("inbox.css", () => {
  it("declares no pixel font size below 13px", () => {
    const sizes = [...inboxCss.matchAll(/font(?:-size)?:[^;]*?\b(\d+(?:\.\d+)?)px/g)].map((m) =>
      Number(m[1]),
    );
    expect(sizes.every((size) => size >= MIN_FONT_PX)).toBe(true);
  });

  it("shows the tab counts at 13px in --text-2", () => {
    expect(inboxCss).toMatch(
      /\.inbox-top \.tab \.count-plain\s*\{[^}]*font-size:\s*var\(--fs-13\);[^}]*color:\s*var\(--text-2\);/,
    );
  });

  it("shows the Neu tab's count badge at 13px like the other tab counts", () => {
    expect(inboxCss).toMatch(
      /\.inbox-top \.tab \.count-badge\s*\{[^}]*font-size:\s*var\(--fs-13\);/,
    );
  });

  // The pixel check above cannot see a shared 12px class such as .hint used from a component.
  it("uses no 12px .hint class in an inbox component", () => {
    const withHint = inboxComponents.filter(({ source }) =>
      /className=\{?[^>]*\bhint\b/.test(source),
    );
    expect(withHint.map(({ file }) => file)).toEqual([]);
  });

  it("sets row titles in the body size token", () => {
    expect(inboxCss).toMatch(/\.jrow-link\s*\{[^}]*font-size:\s*var\(--fs-body\);/);
  });
});
