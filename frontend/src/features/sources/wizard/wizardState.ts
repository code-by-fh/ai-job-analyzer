import type { InitialRun } from "@/api/platformPaths";
import type { PreviewLink } from "@/api/platforms";
import { DEFAULT_SCHEDULE } from "@/domain/schedule";
import {
  firstErrorStep,
  suggestJobLinks,
  type SourceField,
  type WizardStep,
} from "@/domain/sources";
import type { MessageKey } from "@/i18n/de";
import type { ScheduleDraft } from "../drawer/ScheduleFields";

export type WizardErrors = Partial<Record<SourceField | "links", MessageKey>>;

export interface WizardState {
  step: WizardStep;
  url: string;
  links: PreviewLink[];
  selected: string[];
  filter: string;
  pattern: string;
  advancedOpen: boolean;
  name: string;
  schedule: ScheduleDraft;
  initialRun: InitialRun;
  errors: WizardErrors;
}

export type WizardAction =
  | { type: "url"; url: string }
  | { type: "linksLoaded"; links: PreviewLink[] }
  | { type: "errors"; errors: WizardErrors }
  | { type: "toggle"; url: string }
  | { type: "selectAll"; urls: string[] }
  | { type: "selectNone"; urls: string[] }
  | { type: "filter"; filter: string }
  | { type: "pattern"; pattern: string }
  | { type: "advanced"; open: boolean }
  | { type: "name"; name: string }
  | { type: "schedule"; schedule: ScheduleDraft }
  | { type: "initialRun"; initialRun: InitialRun }
  | { type: "back" }
  | { type: "next" }
  | { type: "serverErrors"; fields: SourceField[] };

const FIRST_STEP: WizardStep = 1;
const LINKS_STEP: WizardStep = 2;
const LAST_STEP: WizardStep = 3;

/** D10: step 3 starts with the schedule on (Mo-Fr 08:00) and the seed run (B8 default). */
export const INITIAL_WIZARD: WizardState = {
  step: FIRST_STEP,
  url: "",
  links: [],
  selected: [],
  filter: "",
  pattern: "",
  advancedOpen: false,
  name: "",
  schedule: { enabled: true, ...DEFAULT_SCHEDULE },
  initialRun: "seed",
  errors: {},
};

// Fixed texts per field; the server's own message is never shown.
const SERVER_ERROR_TEXT: Readonly<Record<SourceField, MessageKey>> = {
  url: "sources.error.url",
  selected_urls: "sources.wizard.pickOne",
  url_pattern: "sources.error.pattern",
  name: "sources.error.name",
  schedule_time: "sources.error.time",
  schedule_days: "sources.error.days",
};

/** The found links whose text or address contains the filter (case-insensitive). */
export function visibleLinks(state: WizardState): PreviewLink[] {
  const needle = state.filter.trim().toLowerCase();
  if (!needle) return state.links;
  return state.links.filter((link) => `${link.text} ${link.url}`.toLowerCase().includes(needle));
}

/** D10: the wizard holds something to lose from the first typed character on. */
export function isWizardDirty(state: WizardState): boolean {
  return state.url.trim() !== "";
}

function withSelection(state: WizardState, urls: readonly string[], on: boolean): WizardState {
  const rest = state.selected.filter((url) => !urls.includes(url));
  return { ...state, selected: on ? [...rest, ...urls] : rest, errors: {} };
}

function withServerErrors(state: WizardState, fields: readonly SourceField[]): WizardState {
  const errors: WizardErrors = Object.fromEntries(
    fields.map((field) => [field, SERVER_ERROR_TEXT[field]]),
  );
  const step = firstErrorStep(fields) ?? state.step;
  const advancedOpen = state.advancedOpen || fields.includes("url_pattern");
  return { ...state, errors, step, advancedOpen };
}

function next(state: WizardState): WizardState {
  if (state.step === LINKS_STEP && state.selected.length === 0) {
    return { ...state, errors: { links: "sources.wizard.pickOne" } };
  }
  return { ...state, step: Math.min(LAST_STEP, state.step + 1) as WizardStep, errors: {} };
}

function back(state: WizardState): WizardState {
  return { ...state, step: Math.max(FIRST_STEP, state.step - 1) as WizardStep, errors: {} };
}

/** A new check replaces the links; the filter starts empty and the job links are preselected. */
function linksLoaded(state: WizardState, links: PreviewLink[]): WizardState {
  return { ...state, links, selected: suggestJobLinks(links), filter: "", step: LINKS_STEP };
}

type Handlers = {
  [K in WizardAction["type"]]: (
    state: WizardState,
    action: Extract<WizardAction, { type: K }>,
  ) => WizardState;
};

const HANDLERS: Handlers = {
  url: (state, { url }) => ({ ...state, url, errors: {} }),
  linksLoaded: (state, { links }) => ({ ...linksLoaded(state, links), errors: {} }),
  errors: (state, { errors }) => ({ ...state, errors }),
  toggle: (state, { url }) => withSelection(state, [url], !state.selected.includes(url)),
  selectAll: (state, { urls }) => withSelection(state, urls, true),
  selectNone: (state, { urls }) => withSelection(state, urls, false),
  filter: (state, { filter }) => ({ ...state, filter }),
  pattern: (state, { pattern }) => ({ ...state, pattern }),
  advanced: (state, { open }) => ({ ...state, advancedOpen: open }),
  name: (state, { name }) => ({ ...state, name }),
  schedule: (state, { schedule }) => ({ ...state, schedule }),
  initialRun: (state, { initialRun }) => ({ ...state, initialRun }),
  back,
  next,
  serverErrors: (state, { fields }) => withServerErrors(state, fields),
};

/** D10: every entry of every step lives here, so Zurück and Weiter never lose one. */
export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  // TypeScript cannot correlate HANDLERS[action.type] with the action's own type; the mapped type guarantees it.
  const handler = HANDLERS[action.type] as (
    state: WizardState,
    action: WizardAction,
  ) => WizardState;
  return handler(state, action);
}
