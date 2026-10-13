import { describe, expect, it } from "vitest";
import { parseFitReasoning } from "@/domain/reasoning";

const GERMAN = `## Zusammenfassung
Du passt gut. Die Rolle ist breit.

## Stärken & Übereinstimmung
- **Kotlin** seit fünf Jahren
- Kafka in Produktion

## Lücken & Herausforderungen
* Kein GCP
* Reisebereitschaft 30 %

## Empfehlung
Bewirb dich.`;

const ENGLISH = `## Summary
Good fit.
## Strengths & Match
- Kotlin
## Gaps & Challenges
- No GCP
## Recommendation
Apply.`;

describe("parseFitReasoning", () => {
  it("splits the German analysis into its four sections", () => {
    expect(parseFitReasoning(GERMAN)).toEqual({
      summary: "Du passt gut. Die Rolle ist breit.",
      strengths: ["**Kotlin** seit fünf Jahren", "Kafka in Produktion"],
      gaps: ["Kein GCP", "Reisebereitschaft 30 %"],
      recommendation: "Bewirb dich.",
      other: [],
    });
  });

  it("reads the English headings", () => {
    expect(parseFitReasoning(ENGLISH)).toMatchObject({ strengths: ["Kotlin"], gaps: ["No GCP"] });
  });

  it("accepts bold lines as headings", () => {
    expect(parseFitReasoning("**Lücken**\n- Kein GCP")?.gaps).toEqual(["Kein GCP"]);
  });

  it("uses plain lines as items when a section has no bullets", () => {
    expect(parseFitReasoning("## Stärken\nKotlin\nKafka")?.strengths).toEqual(["Kotlin", "Kafka"]);
  });

  it("returns null for free text without known headings", () => {
    expect(parseFitReasoning("Passt gut, aber Gehalt unklar.")).toBeNull();
    expect(parseFitReasoning(null)).toBeNull();
  });
});

describe("parseFitReasoning is lossless", () => {
  it("keeps the text before the first heading", () => {
    const result = parseFitReasoning("Vorab ein Hinweis.\n## Stärken\n- Kotlin");
    expect(result?.other).toEqual([{ heading: null, body: "Vorab ein Hinweis." }]);
  });

  it("keeps an unknown heading with its body", () => {
    const result = parseFitReasoning("## Stärken\n- Kotlin\n## Sonstiges\nGehalt unklar.");
    expect(result?.other).toEqual([{ heading: "Sonstiges", body: "Gehalt unklar." }]);
  });

  it("keeps a ### heading inside a known section", () => {
    const result = parseFitReasoning("## Stärken\n- Kotlin\n### Details\n- Kafka");
    expect(result?.strengths).toEqual(["Kotlin", "Details", "Kafka"]);
  });

  it("keeps a bold-only line inside a section", () => {
    const result = parseFitReasoning("## Zusammenfassung\nEins.\n**Wichtig**\nZwei.");
    expect(result?.summary).toBe("Eins. **Wichtig** Zwei.");
  });

  it("joins a repeated heading instead of overwriting", () => {
    const result = parseFitReasoning("## Empfehlung\nErstens.\n## Empfehlung\nZweitens.");
    expect(result?.recommendation).toBe("Erstens. Zweitens.");
  });

  it("appends nested bullets to their parent item", () => {
    const result = parseFitReasoning("## Stärken\n- Kotlin\n  - Spring\n  - Ktor\n- Kafka");
    expect(result?.strengths).toEqual(["Kotlin: Spring; Ktor", "Kafka"]);
  });

  it("keeps every content line somewhere in the output", () => {
    const input = `Vorwort eins
## Zusammenfassung
Satz A
### Unterpunkt B
## Stärken
- Stärke C
  - Detail D
**Fett E**
## Anderes F
Text G
- Liste H
## Lücken
* Lücke I
## Empfehlung
Rat J`;
    const output = JSON.stringify(parseFitReasoning(input));
    const knownHeadings = ["## Zusammenfassung", "## Stärken", "## Lücken", "## Empfehlung"];
    const contents = input
      .split("\n")
      .filter((line) => !knownHeadings.includes(line))
      .map((line) => line.replace(/^\s*(?:#+|[-*])\s*|\*\*/g, "").trim());
    expect(contents).toHaveLength(11);
    expect(contents.filter((content) => !output.includes(content))).toEqual([]);
  });
});
