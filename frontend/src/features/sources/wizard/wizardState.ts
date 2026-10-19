import type { InitialRun } from "@/api/platformPaths";
import type { PreviewLink } from "@/api/platforms";
import { DEFAULT_SCHEDULE } from "@/domain/schedule";
import { firstErrorStep, isPattern, type SourceField, type WizardStep } from "@/domain/sources";
import type { MessageKey } from "@/i18n/de";
import type { ScheduleDraft } from "../drawer/ScheduleFields";

export type WizardErrors = Partial<Record<SourceField | "links" | "patternConfirm", MessageKey>>;

export interface WizardState {
  step: WizardStep;
  url: string;
  links: PreviewLink[];
  selected: string[];
  filter: string;
  /** A pattern the user typed; null follows the one derived from the chosen links. */
  customPattern: string | null;
  /** The pattern the user confirmed with "Muster passt"; a different shown pattern is unconfirmed. */
  confirmedPattern: string | null;
  /** The confirmed pattern, kept when step 2 is left; what the setup sends. */
  pattern: string;
  name: string;
  schedule: ScheduleDraft;
  initialRun: InitialRun;
  /** The notification channels chosen on the last step. */
  channelIds: string[];
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
  | { type: "confirmPattern"; pattern: string | null }
  | { type: "name"; name: string }
  | { type: "schedule"; schedule: ScheduleDraft }
  | { type: "initialRun"; initialRun: InitialRun }
  | { type: "channels"; channelIds: string[] }
  | { type: "back" }
  /** On step 2 it carries the shown pattern (typed, or derived by the server); null while deriving. */
  | { type: "next"; pattern?: string | null }
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
  customPattern: null,
  confirmedPattern: null,
  pattern: "",
  name: "",
  schedule: { enabled: true, ...DEFAULT_SCHEDULE },
  initialRun: "seed",
  channelIds: [],
  errors: {},
};

// Fixed texts per field; the server's own message is never shown.
const SERVER_ERROR_TEXT: Readonly<Record<SourceField, MessageKey>> = {
  url: "sources.error.url",
  selected_urls: "sources.wizard.pickOne",
  url_pattern: "sources.error.pattern",
  name: "sources.error.name",
  schedule_times: "sources.error.time",
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
  return { ...state, errors, step };
}

/**
 * Step 2 needs a chosen link and a valid pattern the user confirmed as shown. While a new pattern is
 * derived the shown one is the previous answer, so nothing counts as confirmed until it arrives.
 */
function linksStepErrors(state: WizardState, pattern: string | null): WizardErrors | null {
  if (state.selected.length === 0) return { links: "sources.wizard.pickOne" };
  if (pattern === null) return { patternConfirm: "sources.wizard.patternWait" };
  if (!isPattern(pattern)) return { url_pattern: "sources.error.pattern" };
  if (state.confirmedPattern !== pattern)
    return { patternConfirm: "sources.wizard.patternConfirm" };
  return null;
}

function next(state: WizardState, pattern: string | null = ""): WizardState {
  const forward = { ...state, step: Math.min(LAST_STEP, state.step + 1) as WizardStep, errors: {} };
  if (state.step !== LINKS_STEP) return forward;
  const errors = linksStepErrors(state, pattern);
  return errors ? { ...state, errors } : { ...forward, pattern: (pattern ?? "").trim() };
}

function back(state: WizardState): WizardState {
  return { ...state, step: Math.max(FIRST_STEP, state.step - 1) as WizardStep, errors: {} };
}

/**
 * A new check replaces the links and starts over: nothing is preselected (feedback 1, T5), the
 * user picks the examples the pattern is derived from.
 */
function linksLoaded(state: WizardState, links: PreviewLink[]): WizardState {
  return {
    ...state,
    links,
    selected: [],
    filter: "",
    customPattern: null,
    confirmedPattern: null,
    step: LINKS_STEP,
  };
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
  pattern: (state, { pattern }) => ({ ...state, customPattern: pattern }),
  confirmPattern: (state, { pattern }) => ({ ...state, confirmedPattern: pattern, errors: {} }),
  name: (state, { name }) => ({ ...state, name }),
  schedule: (state, { schedule }) => ({ ...state, schedule }),
  initialRun: (state, { initialRun }) => ({ ...state, initialRun }),
  channels: (state, { channelIds }) => ({ ...state, channelIds }),
  back,
  next: (state, { pattern }) => next(state, pattern),
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
