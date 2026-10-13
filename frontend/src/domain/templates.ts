import type { Profile } from "@/api/profile";
import { DEFAULT_FILE_TEMPLATE, TEMPLATE_STATUS, type TemplateDocType } from "@/api/profilePaths";
import type { DocumentTemplate, FileTemplates } from "@/api/templates";

export type TemplateKind = "cv" | "letter";
export const TEMPLATE_KINDS: readonly TemplateKind[] = ["cv", "letter"];
export const DOC_TYPE_OF: Readonly<Record<TemplateKind, TemplateDocType>> = {
  cv: "CV",
  letter: "COVER_LETTER",
};
export const SELECTION_FIELD = {
  cv: "cv_template",
  letter: "cover_letter_template",
} as const satisfies Record<TemplateKind, keyof Profile>;
const FILE_CATEGORY = { cv: "cv", letter: "cover_letter" } as const satisfies Record<
  TemplateKind,
  keyof FileTemplates
>;

/**
 * D10: a fill running this long lost its worker. The clock starts at `updated_at`, which is set
 * when the template is created (the fill writes it only at its end), so time spent waiting in the
 * queue counts too. The task itself ends by its hard limit (810 s, server
 * workers/tasks/time_limits.py FILL_HARD_TIME_LIMIT_SECONDS); 15 min leaves about 90 s of queue wait.
 */
export const TEMPLATE_STALL_MS = 15 * 60_000;

export type TemplateState = "ready" | "processing" | "stalled" | "rejected" | "failed";
type StateInput = Pick<DocumentTemplate, "status" | "updated_at" | "created_at">;

function startedAt(template: StateInput): number | null {
  const stamp = template.updated_at ?? template.created_at;
  return stamp ? Date.parse(stamp) : null;
}

/** The server status as a UI state; an unknown status reads as ready (the template renders). */
export function templateState(template: StateInput, now: number): TemplateState {
  if (template.status === TEMPLATE_STATUS.rejected) return "rejected";
  if (template.status === TEMPLATE_STATUS.failed) return "failed";
  if (template.status !== TEMPLATE_STATUS.processing) return "ready";
  const started = startedAt(template);
  return started !== null && now - started > TEMPLATE_STALL_MS ? "stalled" : "processing";
}

export type TemplateOrigin = "builtin" | "global" | "own";

export interface TemplateCard {
  /** What the server stores as the selection: a file key or the template id as a string. */
  ref: string;
  name: string;
  origin: TemplateOrigin;
  state: TemplateState;
  /** The DocumentTemplate id; null for a bundled template. */
  id: number | null;
  createdAt: string | null;
}

interface GalleryInput {
  kind: TemplateKind;
  files: FileTemplates;
  templates: readonly DocumentTemplate[];
  now: number;
}

function builtinCard(key: string): TemplateCard {
  return { ref: key, name: key, origin: "builtin", state: "ready", id: null, createdAt: null };
}

function templateCard(template: DocumentTemplate, now: number): TemplateCard {
  return {
    ref: String(template.id),
    name: template.name,
    origin: template.is_admin ? "global" : "own",
    state: templateState(template, now),
    id: template.id,
    createdAt: template.created_at ?? null,
  };
}

/** D9: bundled first, then global, then own templates of one kind. */
export function galleryOf({ kind, files, templates, now }: GalleryInput): TemplateCard[] {
  const ofKind = templates.filter((template) => template.doc_type === DOC_TYPE_OF[kind]);
  const cards = ofKind.map((template) => templateCard(template, now));
  return [
    ...files[FILE_CATEGORY[kind]].map(builtinCard),
    ...cards.filter((card) => card.origin === "global"),
    ...cards.filter((card) => card.origin === "own"),
  ];
}

type Selection = Pick<Profile, "cv_template" | "cover_letter_template">;

/** The stored default, or the server's fallback when it names nothing in the gallery. */
export function defaultRef(
  kind: TemplateKind,
  selection: Selection,
  cards: readonly TemplateCard[],
): string {
  const stored = selection[SELECTION_FIELD[kind]];
  return stored && cards.some((card) => card.ref === stored) ? stored : DEFAULT_FILE_TEMPLATE;
}

/** The server answers 409 for a template the AI is still filling. */
export function canBeDefault(card: TemplateCard): boolean {
  return card.state !== "processing" && card.state !== "stalled";
}

export type TemplateOutcome = "ready" | "rejected" | "failed";
const FILLING: readonly TemplateState[] = ["processing", "stalled"];
const OUTCOMES: readonly TemplateState[] = ["ready", "rejected", "failed"];

/** D13: a card that left the AI fill since it was last seen; null for anything else. */
export function templateOutcome(
  previous: TemplateState | undefined,
  next: TemplateState,
): TemplateOutcome | null {
  if (!previous || !FILLING.includes(previous) || !OUTCOMES.includes(next)) return null;
  return next as TemplateOutcome;
}
