"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { Dispatch } from "react";
import { deriveUrlPattern, type PreviewLink } from "@/api/platforms";
import { queryKeys } from "@/api/queryKeys";
import { linkPath, matchingCount } from "@/domain/sources";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { CheckField, TextField } from "@/ui/Field";
import { Notice } from "@/ui/Notice";
import { GroupError } from "../drawer/ScheduleFields";
import { UrlPatternField } from "../SourceFields";
import { StepFoot } from "./StepFoot";
import { WizardGroup } from "./WizardGroup";
import { visibleLinks, type WizardAction, type WizardState } from "./wizardState";

export const WIZARD_FILTER_ID = "wizard-filter";
export const WIZARD_PATTERN_ID = "wizard-pattern";
export const WIZARD_PATTERN_OK_ID = "wizard-pattern-ok";
const LINKS_ERROR_ID = "wizard-links-error";
const PATTERN_HEADING_ID = "wizard-pattern-h";
const CONFIRM_ERROR_ID = "wizard-pattern-ok-error";

/** The checkbox of the n-th shown link; the first one is where a setup 422 on the links lands. */
export function linkRowId(index: number): string {
  return `wizard-link-${index}`;
}

/** Weiter's own check and a setup 422 on `selected_urls` (R12) both show under the list. */
function linksError(state: WizardState) {
  return state.errors.links ?? state.errors.selected_urls;
}

interface StepProps {
  state: WizardState;
  dispatch: Dispatch<WizardAction>;
}

/** The host as typed, "www." included (hostOf drops it): the sentence names the page that was read. */
function checkedHost(url: string): string {
  const text = url.trim();
  return URL.canParse(text) ? new URL(text).host : text;
}

interface ShownPattern {
  /** What the field shows: the typed pattern, else the one derived from the chosen links. */
  pattern: string;
  deriving: boolean;
  failed: boolean;
}

/**
 * The server derives the pattern (routers/platforms.py `_infer_url_pattern`, the setup's own rule),
 * so the wizard shows exactly what would be stored. The previous answer stays while the next loads.
 */
function useShownPattern(state: WizardState): ShownPattern {
  const selected = [...state.selected].sort();
  const derived = useQuery({
    queryKey: queryKeys.urlPattern(selected),
    queryFn: () => deriveUrlPattern(selected),
    enabled: selected.length > 0 && state.customPattern === null,
    placeholderData: keepPreviousData,
    staleTime: Infinity,
  });
  if (state.customPattern !== null) {
    return { pattern: state.customPattern, deriving: false, failed: false };
  }
  const chosen = selected.length > 0;
  return {
    pattern: chosen ? (derived.data ?? "") : "",
    deriving: chosen && derived.isFetching,
    failed: chosen && derived.isError,
  };
}

/**
 * D10 step 2 (feedback 1, T5): nothing preselected; the chosen examples teach the app which links
 * are postings, and the pattern derived from them is shown, editable, until the user confirms it.
 */
export function LinksStep({ state, dispatch }: StepProps) {
  const { t } = useI18n();
  const shown = useShownPattern(state);
  return (
    <>
      <FoundLine state={state} />
      <p className="prose wizard-why">{t("sources.wizard.linksWhy")}</p>
      <LinkChoice state={state} dispatch={dispatch} />
      <PatternCheck state={state} dispatch={dispatch} shown={shown} />
      <StepFoot onBack={() => dispatch({ type: "back" })}>
        <Button
          variant="primary"
          onClick={() => dispatch({ type: "next", pattern: shown.deriving ? null : shown.pattern })}
        >
          {t("sources.wizard.next")}
        </Button>
      </StepFoot>
    </>
  );
}

/** The filter, the list and the list's own error. */
function LinkChoice({ state, dispatch }: StepProps) {
  const { t } = useI18n();
  const error = linksError(state);
  return (
    <>
      <LinkFilter state={state} dispatch={dispatch} />
      <LinkList state={state} dispatch={dispatch} />
      {error ? <GroupError id={LINKS_ERROR_ID} message={t(error)} /> : null}
    </>
  );
}

function FoundLine({ state }: Pick<StepProps, "state">) {
  const { t } = useI18n();
  const host = checkedHost(state.url);
  const count = state.links.length;
  return (
    <p className="prose">
      {count === 1
        ? t("sources.wizard.foundOne", { host })
        : t("sources.wizard.found", { host, count })}
    </p>
  );
}

/** The filter narrows the list; "Alle auswählen" and "Keine" act on what it shows. */
function LinkFilter({ state, dispatch }: StepProps) {
  const { t } = useI18n();
  return (
    <div className="link-tools">
      <TextField
        id={WIZARD_FILTER_ID}
        type="search"
        label={t("sources.wizard.filter")}
        value={state.filter}
        onChange={(event) => dispatch({ type: "filter", filter: event.target.value })}
      />
      <SelectionTools state={state} dispatch={dispatch} />
    </div>
  );
}

function SelectionTools({ state, dispatch }: StepProps) {
  const { t } = useI18n();
  const urls = visibleLinks(state).map((link) => link.url);
  return (
    <div className="link-select">
      <Button variant="ghost" size="sm" onClick={() => dispatch({ type: "selectAll", urls })}>
        {t("sources.wizard.all")}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => dispatch({ type: "selectNone", urls })}>
        {t("sources.wizard.none")}
      </Button>
      <span className="link-count">
        {t("sources.wizard.selected", { count: state.selected.length })}
      </span>
    </div>
  );
}

function LinkList({ state, dispatch }: StepProps) {
  const { t } = useI18n();
  return (
    <ul
      role="list"
      className="link-list"
      aria-label={t("sources.wizard.step2")}
      aria-describedby={linksError(state) ? LINKS_ERROR_ID : undefined}
    >
      <LinkRows state={state} dispatch={dispatch} />
    </ul>
  );
}

function LinkRows({ state, dispatch }: StepProps) {
  return visibleLinks(state).map((link, index) => (
    <LinkRow
      key={link.url}
      id={linkRowId(index)}
      link={link}
      checked={state.selected.includes(link.url)}
      onToggle={() => dispatch({ type: "toggle", url: link.url })}
    />
  ));
}

interface LinkRowProps {
  id: string;
  link: PreviewLink;
  checked: boolean;
  onToggle: () => void;
}

/** The link text (its path when it has none) over its path, both text, never a live link. */
function LinkRow({ id, link, checked, onToggle }: LinkRowProps) {
  return (
    <li>
      <input type="checkbox" id={id} checked={checked} onChange={onToggle} />
      <label htmlFor={id}>
        <span>{link.text || linkPath(link.url)}</span>
        <span className="code">{linkPath(link.url)}</span>
      </label>
    </li>
  );
}

interface PatternProps extends StepProps {
  shown: ShownPattern;
}

/** Framed like the finish step's groups: the pattern is the step's second decision, not a detail. */
function PatternCheck(props: PatternProps) {
  const { t } = useI18n();
  return (
    <WizardGroup headingId={PATTERN_HEADING_ID} title={t("sources.wizard.patternTitle")}>
      <p className="hint">{t("sources.wizard.patternIntro")}</p>
      {props.state.selected.length === 0 && props.state.customPattern === null ? (
        <p className="hint">{t("sources.wizard.patternPending")}</p>
      ) : (
        <PatternBody {...props} />
      )}
    </WizardGroup>
  );
}

function PatternBody({ state, dispatch, shown }: PatternProps) {
  return (
    <>
      <UrlPatternField
        id={WIZARD_PATTERN_ID}
        value={shown.pattern}
        onChange={(pattern) => dispatch({ type: "pattern", pattern })}
        error={state.errors.url_pattern}
      />
      <PatternState state={state} shown={shown} />
      <PatternConfirm state={state} dispatch={dispatch} shown={shown} />
    </>
  );
}

/** While deriving, or when the server could not: one line instead of the match count. */
function PatternState({ state, shown }: Omit<PatternProps, "dispatch">) {
  const { t } = useI18n();
  if (shown.failed) return <Notice tone="warn">{t("sources.wizard.patternFailed")}</Notice>;
  if (shown.deriving && !shown.pattern) {
    return <p className="hint">{t("sources.wizard.patternDeriving")}</p>;
  }
  return <PatternMatches links={state.links} pattern={shown.pattern} />;
}

/** "Muster passt" confirms the pattern as shown; any other pattern shows it unchecked again. */
function PatternConfirm({ state, dispatch, shown }: PatternProps) {
  const { t } = useI18n();
  const error = state.errors.patternConfirm;
  // The shown pattern is the previous answer while a new one is derived: not confirmable then.
  const confirmed =
    !shown.deriving && shown.pattern !== "" && state.confirmedPattern === shown.pattern;
  return (
    <div className="pattern-confirm">
      <CheckField
        id={WIZARD_PATTERN_OK_ID}
        label={t("sources.wizard.patternOk")}
        checked={confirmed}
        disabled={shown.deriving}
        onChange={(on) => dispatch({ type: "confirmPattern", pattern: on ? shown.pattern : null })}
      />
      {error ? <GroupError id={CONFIRM_ERROR_ID} message={t(error)} /> : null}
    </div>
  );
}

/** Nothing while empty; a count when it matches; the phase's one amber notice when it matches none. */
function PatternMatches({ links, pattern }: { links: readonly PreviewLink[]; pattern: string }) {
  const { t } = useI18n();
  if (!pattern.trim()) return null;
  const matching = matchingCount(links, pattern);
  if (matching === 0) return <Notice tone="warn">{t("sources.wizard.patternNone")}</Notice>;
  const total = links.length;
  return (
    <p className="hint">
      {matching === 1
        ? t("sources.wizard.patternMatchesOne", { total })
        : t("sources.wizard.patternMatches", { matching, total })}
    </p>
  );
}
