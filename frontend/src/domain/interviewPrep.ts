import { z } from "zod";
import { deepDiveSchema, optionalText, textList } from "@/api/companies";

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
