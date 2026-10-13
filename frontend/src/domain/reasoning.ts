import { BULLET } from "@/domain/markdown";

export interface ReasoningBlock {
  heading: string | null;
  body: string;
}

export interface FitReasoning {
  summary: string;
  strengths: string[];
  gaps: string[];
  recommendation: string;
  /** Everything outside the four known sections, in original order, so no AI text is lost. */
  other: ReasoningBlock[];
}

type SectionKey = "summary" | "strengths" | "gaps" | "recommendation";
interface Section {
  key: SectionKey | null;
  heading: string | null;
  lines: string[];
}

// Headings come from intelligence/prompts.py (German and English); match loosely, the AI varies them.
const SECTION_MATCHERS: ReadonlyArray<readonly [SectionKey, RegExp]> = [
  ["gaps", /lücke|gap|herausforder|challenge/i],
  ["strengths", /stärke|strength|übereinstimm|match/i],
  ["summary", /zusammenfass|summary|fazit/i],
  ["recommendation", /empfehl|recommend/i],
];
const MARKDOWN_HEADING = /^(#{1,6})\s+(.+)$/;
const BOLD_HEADING = /^\*\*(.+?)\*\*:?$/;
const INDENTED_BULLET = /^\s+(?:[-*•]|\d+[.)])\s+(.+)$/;
// Only top-level headings open an unknown block; deeper ones and bold lines stay in their section.
const BLOCK_HEADING_MAX_LEVEL = 2;

/** Splits the analysis markdown into Passt/Lücken (spec 4.2); null when its headings are unknown. */
export function parseFitReasoning(markdown?: string | null): FitReasoning | null {
  if (!markdown) return null;
  const sections = splitSections(markdown);
  if (!sections.some((section) => section.key !== null)) return null;
  const result: FitReasoning = {
    summary: "",
    strengths: [],
    gaps: [],
    recommendation: "",
    other: [],
  };
  for (const section of sections) fill(result, section);
  return result;
}

function sectionKey(heading: string): SectionKey | null {
  return SECTION_MATCHERS.find(([, pattern]) => pattern.test(heading))?.[0] ?? null;
}

function splitSections(markdown: string): Section[] {
  const sections: Section[] = [{ key: null, heading: null, lines: [] }];
  for (const raw of markdown.split("\n")) {
    const line = raw.trimEnd();
    const opened = openSection(line.trim());
    if (opened) sections.push(opened);
    else sections[sections.length - 1].lines.push(line);
  }
  return sections;
}

/** A new section when the line is a heading that starts one; null when it is plain content. */
function openSection(line: string): Section | null {
  const markdown = MARKDOWN_HEADING.exec(line);
  const text = markdown?.[2] ?? BOLD_HEADING.exec(line)?.[1];
  if (text === undefined) return null;
  const key = sectionKey(text);
  if (key) return { key, heading: text, lines: [] };
  const isBlockHeading = markdown !== null && markdown[1].length <= BLOCK_HEADING_MAX_LEVEL;
  return isBlockHeading ? { key: null, heading: text, lines: [] } : null;
}

function fill(result: FitReasoning, section: Section): void {
  if (section.key === null) addOther(result, section);
  else if (section.key === "strengths" || section.key === "gaps") {
    result[section.key].push(...toItems(section.lines));
  } else {
    const text = section.lines.map(plainLine).filter(Boolean).join(" ");
    result[section.key] = [result[section.key], text].filter(Boolean).join(" ");
  }
}

function addOther(result: FitReasoning, section: Section): void {
  const body = section.lines.join("\n").trim();
  if (body !== "" || section.heading !== null)
    result.other.push({ heading: section.heading, body });
}

/** A heading line inside a section keeps its words, minus the marker. */
function plainLine(line: string): string {
  const text = line.trim();
  return MARKDOWN_HEADING.exec(text)?.[2] ?? text;
}

function toItems(lines: readonly string[]): string[] {
  const items: string[] = [];
  let subCount = 0;
  for (const line of lines.filter((entry) => entry.trim() !== "")) {
    const nested = INDENTED_BULLET.exec(line)?.[1];
    if (nested !== undefined && items.length > 0) {
      items[items.length - 1] += `${subCount === 0 ? ": " : "; "}${nested.trim()}`;
      subCount += 1;
    } else {
      items.push(BULLET.exec(line.trim())?.[1].trim() ?? plainLine(line));
      subCount = 0;
    }
  }
  return items;
}
