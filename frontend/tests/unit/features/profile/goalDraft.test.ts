import { describe, expect, it } from "vitest";
import { goalDraftOf, goalPatch } from "@/features/profile/goal/goalDraft";

const STORED = {
  role: " Lead ",
  skills: "Kotlin, Java",
  min_salary: "80000",
  location: "Hamburg",
  preferences: "Hybrid",
  spoken_languages: ["Deutsch", "deutsch", "Englisch"],
};

describe("goalDraft", () => {
  // Preflight ruling 28: legacy rows may hold the same language twice; chips are keyed by text.
  it("drops case duplicates from stored spoken languages", () => {
    expect(goalDraftOf(STORED).spoken_languages).toEqual(["Deutsch", "Englisch"]);
  });

  it("sends trimmed text and the skills joined", () => {
    const patch = goalPatch(goalDraftOf(STORED));
    expect(patch.role).toBe("Lead");
    expect(patch.skills).toBe("Kotlin, Java");
  });
});
