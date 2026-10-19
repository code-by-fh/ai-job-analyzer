import { describe, expect, it } from "vitest";
import {
  gapsByWeight,
  parseInterviewPrep,
  prepLinks,
  prepPhase,
  prepSections,
  type InterviewPrep,
} from "@/domain/interviewPrep";

const PREP = {
  report_output: { executive_summary: "Gute Ausgangslage.", deep_dive_analysis: "## Tiefe" },
  structured_prep: {
    elevator_pitch: "Ich baue robuste Systeme.",
    gap_analysis: [
      {
        requirement: "GCP",
        cv_status: "fehlt",
        gap_severity: "High",
        interview_strategy: "AWS-Erfahrung übertragen",
      },
    ],
  },
  deep_dive_buttons: [{ title: "Team", focus: "Teamgröße", how_to_proceed: "LinkedIn" }],
  confidence_assessment: { overall_confidence: "Moderate", uncertainties: "Budget" },
  social_intelligence_research: { potential_contacts: [{ name: "A. Muster", role: "CTO" }] },
};

describe("parseInterviewPrep", () => {
  it("is none without material", () => {
    expect(parseInterviewPrep(null)).toEqual({ kind: "none" });
  });

  it("reads the stored JSON string", () => {
    const parsed = parseInterviewPrep(JSON.stringify(PREP));
    expect(parsed.kind).toBe("prep");
    expect(parsed.kind === "prep" && parsed.prep.structured_prep?.gap_analysis[0].requirement).toBe(
      "GCP",
    );
  });

  it("formats contacts with their role", () => {
    const parsed = parseInterviewPrep(JSON.stringify(PREP));
    expect(
      parsed.kind === "prep" && parsed.prep.social_intelligence_research?.potential_contacts,
    ).toEqual(["A. Muster (CTO)"]);
  });

  it("is unreadable for broken JSON", () => {
    expect(parseInterviewPrep("{kaputt")).toEqual({ kind: "unreadable" });
  });

  it("is unreadable when the AI answer could not be parsed on the server", () => {
    expect(parseInterviewPrep(JSON.stringify({ error: "parse", raw_response: "x" }))).toEqual({
      kind: "unreadable",
    });
  });

  it("drops only the broken item of a list", () => {
    const raw = JSON.stringify({
      structured_prep: {
        gap_analysis: [{ requirement: "GCP" }, { nope: 1 }, { requirement: "K8s" }],
      },
      deep_dive_buttons: [{ title: "Team" }, 7],
    });
    const parsed = parseInterviewPrep(raw);
    expect(parsed.kind === "prep" && parsed.prep.structured_prep?.gap_analysis).toHaveLength(2);
    expect(parsed.kind === "prep" && parsed.prep.deep_dive_buttons).toHaveLength(1);
  });

  it("is unreadable for an object without any content", () => {
    expect(parseInterviewPrep("{}")).toEqual({ kind: "unreadable" });
  });

  it("keeps a contact without a name and reads research sources per item", () => {
    const parsed = parseInterviewPrep(
      JSON.stringify({
        social_intelligence_research: {
          potential_contacts: [{ role: "CTO" }, { name: "B. Beispiel" }, {}],
          research_sources: ["https://acme.de/blog", { title: "Talk", url: "https://x.de/t" }, 7],
        },
      }),
    );
    const social = parsed.kind === "prep" ? parsed.prep.social_intelligence_research : null;
    expect(social?.potential_contacts).toEqual(["CTO", "B. Beispiel", ""]);
    expect(social?.research_sources).toEqual(["https://acme.de/blog", "Talk https://x.de/t"]);
  });
});

describe("prepPhase", () => {
  const IDLE_JOB = { interview_prep_running: false, interview_prep_error: null };

  it("is running while the server reports a run, whatever the client remembers", () => {
    expect(prepPhase({ ...IDLE_JOB, interview_prep_running: true }, "idle")).toBe("running");
    expect(prepPhase({ ...IDLE_JOB, interview_prep_running: true }, "stalled")).toBe("running");
  });

  it("follows the client between the start request and the reloaded job", () => {
    expect(prepPhase({ ...IDLE_JOB, interview_prep_error: "x" }, "running")).toBe("running");
  });

  it("is failed when the server ended the last run with an error", () => {
    expect(prepPhase({ ...IDLE_JOB, interview_prep_error: "x" }, "idle")).toBe("failed");
  });

  it("is idle without a run or an error", () => {
    expect(prepPhase(IDLE_JOB, "idle")).toBe("idle");
  });
});

function prepOf(raw: object): InterviewPrep {
  const parsed = parseInterviewPrep(JSON.stringify(raw));
  if (parsed.kind !== "prep") throw new Error("fixture must parse");
  return parsed.prep;
}

const gap = (requirement: string, gap_severity?: string) => ({ requirement, gap_severity });

describe("gapsByWeight", () => {
  it("puts heavy gaps first and keeps the AI's order within a weight", () => {
    const gaps = [gap("A", "Low"), gap("B", "hoch"), gap("C", "Medium"), gap("D", "High")];
    expect(
      gapsByWeight(prepOf({ structured_prep: { gap_analysis: gaps } })).map((g) => g.requirement),
    ).toEqual(["B", "D", "C", "A"]);
  });

  it("puts gaps with an unknown or missing weight last", () => {
    const gaps = [gap("A"), gap("B", "katastrophal"), gap("C", "Low")];
    expect(
      gapsByWeight(prepOf({ structured_prep: { gap_analysis: gaps } })).map((g) => g.requirement),
    ).toEqual(["C", "A", "B"]);
  });

  it("is empty without a structured prep", () => {
    expect(gapsByWeight(prepOf({ online_resources: ["https://acme.de"] }))).toEqual([]);
  });
});

describe("prepSections", () => {
  it("lists every section with content in reading order", () => {
    const prep = prepOf({
      ...PREP,
      confidence_assessment: { overall_confidence: "High", uncertainties: ["Budget"] },
      online_resources: ["https://acme.de/karriere"],
    });
    expect(prepSections(prep).map((entry) => entry.key)).toEqual([
      "pitch",
      "gaps",
      "uncertainties",
      "depth",
      "deepDives",
      "contacts",
      "sources",
    ]);
  });

  it("leaves out empty sections; a confidence without open points is no section", () => {
    const prep = prepOf({
      structured_prep: { gap_analysis: [], elevator_pitch: "" },
      confidence_assessment: { overall_confidence: "High", uncertainties: [] },
      social_intelligence_research: { potential_contacts: [], insights_from_contacts: [] },
      online_resources: ["https://acme.de/karriere"],
    });
    expect(prepSections(prep).map((entry) => entry.key)).toEqual(["sources"]);
  });

  it("counts the items of list sections and not the text sections", () => {
    const prep = prepOf({
      ...PREP,
      confidence_assessment: { uncertainties: ["Budget", "Team"] },
      social_intelligence_research: {
        potential_contacts: ["CTO"],
        insights_from_contacts: ["Mag Kotlin"],
        research_sources: ["Blog https://acme.de/blog"],
      },
      online_resources: ["https://acme.de/blog", "https://acme.de/karriere"],
    });
    expect(prepSections(prep)).toEqual([
      { key: "pitch", count: null },
      { key: "gaps", count: 1 },
      { key: "uncertainties", count: 2 },
      { key: "depth", count: null },
      { key: "deepDives", count: 1 },
      { key: "contacts", count: 2 },
      { key: "sources", count: 2 },
    ]);
  });
});

describe("prepLinks", () => {
  it("lists a URL that a research source already links only once", () => {
    const prep = prepOf({
      social_intelligence_research: { research_sources: ["Blog https://acme.de/blog"] },
      online_resources: ["https://acme.de/blog", "https://acme.de/karriere"],
    });
    expect(prepLinks(prep)).toEqual({
      sources: ["Blog https://acme.de/blog"],
      links: ["https://acme.de/karriere"],
    });
  });
});
