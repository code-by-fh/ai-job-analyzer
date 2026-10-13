import { describe, expect, it } from "vitest";
import { parseImportUrl } from "@/features/inbox/import/importUrl";

describe("parseImportUrl", () => {
  it("accepts a complete http(s) link and trims it", () => {
    expect(parseImportUrl("  https://karriere.example.de/jobs/1 ")).toBe(
      "https://karriere.example.de/jobs/1",
    );
  });

  it("refuses links without scheme, host dot or with another scheme", () => {
    const refused = [
      "karriere.example.de/job",
      "https://localhost/x",
      "javascript:alert(1)",
      "",
      "https://a b.de",
    ];
    expect(refused.map(parseImportUrl)).toEqual([null, null, null, null, null]);
  });
});
