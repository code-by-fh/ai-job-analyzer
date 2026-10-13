"use client";

import type { Dispatch } from "react";
import type { PreviewLink } from "@/api/platforms";
import { linkPath, matchingCount } from "@/domain/sources";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { Disclosure } from "@/ui/Disclosure";
import { TextField } from "@/ui/Field";
import { Notice } from "@/ui/Notice";
import { GroupError } from "../drawer/ScheduleFields";
import { StepFoot } from "./StepFoot";
import { visibleLinks, type WizardAction, type WizardState } from "./wizardState";

export const WIZARD_FILTER_ID = "wizard-filter";
export const WIZARD_PATTERN_ID = "wizard-pattern";
const LINKS_ERROR_ID = "wizard-links-error";

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

/** D10 step 2: the found links, preselected by suggestJobLinks; the pattern under "Erweitert". */
export function LinksStep({ state, dispatch }: StepProps) {
  const { t } = useI18n();
  const error = linksError(state);
  return (
    <>
      <FoundLine state={state} />
      <LinkFilter state={state} dispatch={dispatch} />
      <LinkList state={state} dispatch={dispatch} />
      {error ? <GroupError id={LINKS_ERROR_ID} message={t(error)} /> : null}
      <PatternField state={state} dispatch={dispatch} />
      <StepFoot onBack={() => dispatch({ type: "back" })}>
        <Button variant="primary" onClick={() => dispatch({ type: "next" })}>
          {t("sources.wizard.next")}
        </Button>
      </StepFoot>
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

/** Preflight R-3: a controlled Disclosure, so a pattern error from the setup can open it (Task 13). */
function PatternField({ state, dispatch }: StepProps) {
  const { t } = useI18n();
  return (
    <Disclosure
      label={t("sources.field.advanced")}
      open={state.advancedOpen}
      onOpenChange={(open) => dispatch({ type: "advanced", open })}
    >
      <PatternInput state={state} dispatch={dispatch} />
      <PatternMatches state={state} />
    </Disclosure>
  );
}

function PatternInput({ state, dispatch }: StepProps) {
  const { t } = useI18n();
  const error = state.errors.url_pattern;
  return (
    <TextField
      id={WIZARD_PATTERN_ID}
      className="code"
      label={t("sources.field.pattern")}
      hint={t("sources.wizard.patternHint")}
      value={state.pattern}
      onChange={(event) => dispatch({ type: "pattern", pattern: event.target.value })}
      error={error ? t(error) : undefined}
    />
  );
}

/** Nothing while empty; a count when it matches; the phase's one amber notice when it matches none. */
function PatternMatches({ state }: Pick<StepProps, "state">) {
  const { t } = useI18n();
  if (!state.pattern.trim()) return null;
  const matching = matchingCount(state.links, state.pattern);
  if (matching === 0) return <Notice tone="warn">{t("sources.wizard.patternNone")}</Notice>;
  const total = state.links.length;
  return (
    <p className="hint">
      {matching === 1
        ? t("sources.wizard.patternMatchesOne", { total })
        : t("sources.wizard.patternMatches", { matching, total })}
    </p>
  );
}
