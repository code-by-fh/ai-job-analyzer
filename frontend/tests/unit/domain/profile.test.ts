import { describe, expect, it } from "vitest";
import {
  chipProblem,
  cleanCv,
  cvGaps,
  hasCvContent,
  joinSkills,
  profileHref,
  sectionFromParam,
  splitSkills,
  toProfileField,
} from "@/domain/profile";

const ENTRY = { company: "Acme", role: "Dev", duration: "2020-", description: "APIs, 40 % faster" };
const BLANK = { company: " ", role: "", duration: "", description: "" };
const LIMITS = { maxItems: 2, maxLength: 5 };

describe("profile sections", () => {
  it("parses known sections and falls back to Ziel", () => {
    expect(sectionFromParam("vorlagen")).toBe("vorlagen");
    expect(sectionFromParam("VORLAGEN")).toBe("ziel");
    expect(sectionFromParam(null)).toBe("ziel");
  });

  it("writes no parameter for the default section", () => {
    expect(profileHref("ziel")).toBe("/profile");
    expect(profileHref("nachweise")).toBe("/profile?section=nachweise");
  });
});

describe("skills", () => {
  it("splits the stored string, trims, drops empties and case duplicates", () => {
    expect(splitSkills(" Kotlin, java ,, Java, Spring Boot ")).toEqual([
      "Kotlin",
      "java",
      "Spring Boot",
    ]);
    expect(splitSkills("")).toEqual([]);
  });

  it("joins with a comma and a space", () => {
    expect(joinSkills(["Kotlin", "Java"])).toBe("Kotlin, Java");
  });

  it("names the problem of a chip before it is added", () => {
    expect(chipProblem([], "  ", LIMITS)).toBe("empty");
    expect(chipProblem(["Go"], "go", LIMITS)).toBe("duplicate");
    expect(chipProblem([], "Kotlin", LIMITS)).toBe("tooLong");
    expect(chipProblem(["a", "b"], "c", LIMITS)).toBe("full");
    expect(chipProblem(["a"], "b", LIMITS)).toBeNull();
  });

  it("refuses a comma inside a skill chip, because the server stores skills comma separated", () => {
    expect(chipProblem([], "a,b", { ...LIMITS, noComma: true })).toBe("comma");
  });
});

describe("hasCvContent (D6: ask before an import replaces data)", () => {
  const EMPTY = {
    role: " ",
    skills: "",
    location: "",
    min_salary: "",
    cv_data: { experience: [], projects: [], education: "" },
  };
  const PROJECT = { name: "Shop", tech_stack: "", description: "" };

  it("is false for an empty profile and for the server's salary default", () => {
    expect(hasCvContent(EMPTY)).toBe(false);
    expect(hasCvContent({ ...EMPTY, min_salary: "60000" })).toBe(false);
  });

  it("is true for each field the import replaces", () => {
    expect(hasCvContent({ ...EMPTY, role: "Lead" })).toBe(true);
    expect(hasCvContent({ ...EMPTY, skills: "Kotlin" })).toBe(true);
    expect(hasCvContent({ ...EMPTY, location: "Hamburg" })).toBe(true);
    expect(hasCvContent({ ...EMPTY, min_salary: "75000" })).toBe(true);
  });

  it("is true for any CV content", () => {
    expect(hasCvContent({ ...EMPTY, cv_data: { ...EMPTY.cv_data, experience: [ENTRY] } })).toBe(
      true,
    );
    expect(hasCvContent({ ...EMPTY, cv_data: { ...EMPTY.cv_data, projects: [PROJECT] } })).toBe(
      true,
    );
    expect(hasCvContent({ ...EMPTY, cv_data: { ...EMPTY.cv_data, education: "BSc" } })).toBe(true);
  });

  // Ruling R10: a fresh row holds server/database/core.py's column defaults, not user input.
  it("is false for a fresh user who only has the server's column defaults", () => {
    const fresh = {
      ...EMPTY,
      role: "Software Engineer",
      skills: "Python, Docker",
      location: "Remote",
      min_salary: "60000",
    };
    expect(hasCvContent(fresh)).toBe(false);
  });

  it("ignores each column default on its own field only", () => {
    expect(hasCvContent({ ...EMPTY, role: " Software Engineer " })).toBe(false);
    expect(hasCvContent({ ...EMPTY, skills: "Python, Docker" })).toBe(false);
    expect(hasCvContent({ ...EMPTY, location: "Remote" })).toBe(false);
    expect(hasCvContent({ ...EMPTY, location: "Software Engineer" })).toBe(true);
    expect(hasCvContent({ ...EMPTY, skills: "Python, Docker, Kotlin" })).toBe(true);
  });
});

describe("CV gaps (usability #26)", () => {
  const full = {
    role: "Lead",
    skills: "Kotlin",
    cv_data: { experience: [ENTRY], projects: [], education: "BSc" },
  };

  it("is empty for a complete profile", () => {
    expect(cvGaps(full)).toEqual([]);
  });

  it("names every gap in order, results last before education", () => {
    const thin = {
      role: " ",
      skills: "",
      cv_data: { experience: [{ ...ENTRY, description: "" }], projects: [], education: "" },
    };
    expect(cvGaps(thin)).toEqual(["role", "skills", "results", "education"]);
  });

  it("reports missing experience instead of missing results", () => {
    expect(cvGaps({ ...full, cv_data: { ...full.cv_data, experience: [] } })).toEqual([
      "experience",
    ]);
  });
});

describe("cleanCv", () => {
  it("trims fields and drops entries that are entirely blank", () => {
    const cleaned = cleanCv({
      experience: [ENTRY, BLANK],
      projects: [{ name: "", tech_stack: "", description: "" }],
      education: " BSc ",
    });
    expect(cleaned).toEqual({ experience: [ENTRY], projects: [], education: "BSc" });
  });
});

describe("toProfileField", () => {
  it("maps server locations onto the form fields", () => {
    expect(toProfileField("role")).toBe("role");
    expect(toProfileField("spoken_languages.0")).toBe("spoken_languages");
    expect(toProfileField("cv_data.experience.3.description")).toBe("cv_data");
    expect(toProfileField("pushover_api_token")).toBeNull();
  });
});
