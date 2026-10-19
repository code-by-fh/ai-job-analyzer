import { z } from "zod";
import { deepDiveSchema, optionalText, textList } from "@/api/companies";
import type { JobDetail } from "@/api/jobs";
import { levelKey, type Level } from "./levels";
import { resourceLinks } from "./links";
import type { TaskPhase } from "./pendingTasks";

// One bad item drops only itself, never the whole list.
function tolerantList<T>(item: z.ZodType<T>) {
  return z
    .array(item.nullable().catch(null))
    .catch([])
    .transform((items) => items.filter((entry): entry is T => entry !== null));
}

const gapSchema = z.object({
  requirement: z.string(),
  cv_status: optionalText,
  gap_severity: optionalText,
  interview_strategy: optionalText,
});

// A contact without a name is still a lead; "" lets the view show a fallback label.
const contactSchema = z.union([
  z.string(),
  z
    .object({ name: optionalText, role: optionalText })
    .transform((contact) =>
      contact.name && contact.role
        ? `${contact.name} (${contact.role})`
        : (contact.name ?? contact.role ?? ""),
    ),
]);

const sourceSchema = z.union([
  z.string(),
  z
    .object({ title: optionalText, name: optionalText, url: optionalText, link: optionalText })
    .transform((source) =>
      [source.title ?? source.name, source.url ?? source.link].filter(Boolean).join(" "),
    ),
]);

// interview_prep_material is AI output stored as a JSON string (inventory A.6); degrade per field.
const prepSchema = z.object({
  report_output: z
    .object({ executive_summary: optionalText, deep_dive_analysis: optionalText })
    .nullish()
    .catch(null),
  structured_prep: z
    .object({ gap_analysis: tolerantList(gapSchema), elevator_pitch: optionalText })
    .nullish()
    .catch(null),
  deep_dive_buttons: tolerantList(deepDiveSchema),
  confidence_assessment: z
    .object({ overall_confidence: optionalText, uncertainties: textList })
    .nullish()
    .catch(null),
  social_intelligence_research: z
    .object({
      potential_contacts: tolerantList(contactSchema),
      insights_from_contacts: textList,
      research_sources: tolerantList(sourceSchema),
    })
    .nullish()
    .catch(null),
  online_resources: z.unknown().optional(),
  error: z.string().nullish(),
});
export type InterviewPrep = z.infer<typeof prepSchema>;

export type PrepGap = NonNullable<InterviewPrep["structured_prep"]>["gap_analysis"][number];

const WEIGHT_RANK: Readonly<Record<Level, number>> = { high: 0, medium: 1, low: 2 };
const UNRANKED = 3;

function weightRank(gap: PrepGap): number {
  const level = levelKey(gap.gap_severity);
  return level ? WEIGHT_RANK[level] : UNRANKED;
}

/** The gaps heaviest first; equal and unknown weights keep the AI's order (sort is stable). */
export function gapsByWeight(prep: InterviewPrep): PrepGap[] {
  return [...(prep.structured_prep?.gap_analysis ?? [])].sort(
    (first, second) => weightRank(first) - weightRank(second),
  );
}

/** The sections below the overview, in reading order. */
export const PREP_SECTIONS = [
  "pitch",
  "gaps",
  "uncertainties",
  "depth",
  "deepDives",
  "contacts",
  "sources",
] as const;
export type PrepSectionKey = (typeof PREP_SECTIONS)[number];

/** Research sources plus the online resources whose URL no source already links. */
export function prepLinks(prep: InterviewPrep): { sources: string[]; links: string[] } {
  const sources = prep.social_intelligence_research?.research_sources ?? [];
  const sourceLinks = resourceLinks(sources);
  const links = resourceLinks(prep.online_resources).filter((link) => !sourceLinks.includes(link));
  return { sources, links };
}

// Text sections count as one; their size is not shown.
const TEXT_SECTIONS: ReadonlySet<PrepSectionKey> = new Set(["pitch", "depth"]);

function sectionSizes(prep: InterviewPrep): Record<PrepSectionKey, number> {
  const social = prep.social_intelligence_research;
  const { sources, links } = prepLinks(prep);
  return {
    pitch: prep.structured_prep?.elevator_pitch ? 1 : 0,
    gaps: prep.structured_prep?.gap_analysis.length ?? 0,
    uncertainties: prep.confidence_assessment?.uncertainties.length ?? 0,
    depth: prep.report_output?.deep_dive_analysis ? 1 : 0,
    deepDives: prep.deep_dive_buttons.length,
    contacts:
      (social?.potential_contacts.length ?? 0) + (social?.insights_from_contacts.length ?? 0),
    sources: sources.length + links.length,
  };
}

export interface PrepSectionEntry {
  key: PrepSectionKey;
  /** Items in a list section; null for a text section. */
  count: number | null;
}

/** The one source of which sections show: the view renders them and the overview lists them. */
export function prepSections(prep: InterviewPrep): PrepSectionEntry[] {
  const sizes = sectionSizes(prep);
  return PREP_SECTIONS.filter((key) => sizes[key] > 0).map((key) => ({
    key,
    count: TEXT_SECTIONS.has(key) ? null : sizes[key],
  }));
}

export type ParsedPrep =
  { kind: "none" } | { kind: "unreadable" } | { kind: "prep"; prep: InterviewPrep };

export function parseInterviewPrep(raw?: string | null): ParsedPrep {
  if (!raw) return { kind: "none" };
  const parsed = prepSchema.safeParse(readJson(raw));
  // The server stores {error, raw_response} when it could not parse the AI answer.
  if (!parsed.success || parsed.data.error || !hasContent(parsed.data)) {
    return { kind: "unreadable" };
  }
  return { kind: "prep", prep: parsed.data };
}

function hasContent(prep: InterviewPrep): boolean {
  const sections = [
    prep.report_output,
    prep.structured_prep,
    prep.confidence_assessment,
    prep.social_intelligence_research,
    prep.online_resources,
  ];
  return prep.deep_dive_buttons.length > 0 || sections.some((section) => section != null);
}

function readJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/**
 * The server's run state wins, so a running prep survives a reload (its sweep ends a lost run); the
 * client phase covers the time between the start request and the next load of the job.
 */
export function prepPhase(
  job: Pick<JobDetail, "interview_prep_running" | "interview_prep_error">,
  clientPhase: TaskPhase,
): TaskPhase {
  if (job.interview_prep_running) return "running";
  if (clientPhase !== "idle") return clientPhase;
  return job.interview_prep_error ? "failed" : "idle";
}
