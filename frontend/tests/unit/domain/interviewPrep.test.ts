import { describe, expect, it } from "vitest";
import { parseInterviewPrep } from "@/domain/interviewPrep";

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
