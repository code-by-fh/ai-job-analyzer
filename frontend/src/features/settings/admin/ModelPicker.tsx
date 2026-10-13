"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useMemo, useState, type KeyboardEvent } from "react";
import { openRouterModelsQueryOptions, type OpenRouterModel } from "@/api/admin";
import { describeError } from "@/api/describeError";
import type { MessageKey } from "@/i18n/de";
import type { Translate } from "@/i18n/translate";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { CheckField, SelectField, TextField } from "@/ui/Field";
import { focusNextFrame, isFocusLost } from "@/ui/focus";
import { Notice } from "@/ui/Notice";
import { filterModels, isFreeModel } from "./modelFilter";
import { ModelField } from "./ModelField";

const MODEL_ID = "settings-ai-cloud-model";
const SEARCH_ID = "settings-ai-model-search";
const PART_SEPARATOR = " · ";

export interface ModelPickerProps {
  value: string;
  onChange: (model: string) => void;
  error?: MessageKey;
  /** The list is fetched with the stored key, so it waits for one (and for a typed one's save). */
  keyStored: boolean;
  keyTyped: boolean;
}

/** Ruling 3: the list never forwards OpenRouter's status; 400 is no_key, 502 openrouter_failed. */
const describeModelsError = (error: unknown, t: Translate) =>
  describeError(error, t, {
    SERVER_ERROR: "settings.ai.modelsFailed",
    BAD_REQUEST: "settings.ai.reason.no_key",
  });

function optionText(model: OpenRouterModel, t: Translate, numbers: Intl.NumberFormat): string {
  const context = model.context_length;
  const base = context
    ? t("settings.ai.modelOption", { name: model.name, context: numbers.format(context) })
    : model.name;
  return isFreeModel(model) ? `${base}${PART_SEPARATOR}${t("settings.ai.free")}` : base;
}

// Enter in the search field filters; it must not submit the provider form.
function keepFormOpen(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key === "Enter") event.preventDefault();
}

interface ModelChoiceProps {
  models: readonly OpenRouterModel[];
  value: string;
  onChange: (model: string) => void;
  error?: MessageKey;
}

/**
 * "Modelle laden" unmounts with its click: once the list renders, focus moves to the search
 * field, unless the admin has moved on meanwhile (spec 4.3 #5, focus never on body).
 */
function useFocusSearch(afterLoad: boolean) {
  useEffect(() => {
    if (afterLoad)
      focusNextFrame(() => (isFocusLost() ? document.getElementById(SEARCH_ID) : null));
  }, [afterLoad]);
}

function ModelOptions({ models, value }: Pick<ModelChoiceProps, "models" | "value">) {
  const { t, language } = useI18n();
  const numbers = useMemo(() => new Intl.NumberFormat(language), [language]);
  const listed = models.some((model) => model.id === value);
  return (
    <>
      {listed || value === "" ? null : <option value={value}>{value}</option>}
      {models.map((model) => (
        <option key={model.id} value={model.id}>
          {optionText(model, t, numbers)}
        </option>
      ))}
    </>
  );
}

interface ModelFiltersProps {
  query: string;
  onQuery: (query: string) => void;
  freeOnly: boolean;
  onFreeOnly: (freeOnly: boolean) => void;
  nothingMatches: boolean;
}

type ModelSearchProps = Pick<ModelFiltersProps, "query" | "onQuery" | "nothingMatches">;

function ModelSearch({ query, onQuery, nothingMatches }: ModelSearchProps) {
  const { t } = useI18n();
  return (
    <TextField
      id={SEARCH_ID}
      type="search"
      autoComplete="off"
      spellCheck={false}
      label={t("settings.ai.searchModels")}
      hint={nothingMatches ? t("settings.ai.noModels") : undefined}
      value={query}
      onChange={(event) => onQuery(event.target.value)}
      onKeyDown={keepFormOpen}
    />
  );
}

function ModelFilters({ freeOnly, onFreeOnly, ...search }: ModelFiltersProps) {
  const { t } = useI18n();
  return (
    <>
      <ModelSearch {...search} />
      <CheckField
        id="settings-ai-free-only"
        label={t("settings.ai.freeOnly")}
        checked={freeOnly}
        onChange={onFreeOnly}
      />
    </>
  );
}

function ModelSelect({ models, value, onChange, error }: ModelChoiceProps) {
  const { t } = useI18n();
  return (
    <SelectField
      id={MODEL_ID}
      label={t("settings.ai.model")}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      error={error ? t(error) : undefined}
    >
      <ModelOptions models={models} value={value} />
    </SelectField>
  );
}

/** D3, once loaded: search, "free only" and a select; the model the form holds stays an option. */
function ModelChoice({ afterLoad, ...props }: ModelChoiceProps & { afterLoad: boolean }) {
  const { models, value, onChange, error } = props;
  useFocusSearch(afterLoad);
  const [query, setQuery] = useState("");
  const [freeOnly, setFreeOnly] = useState(false);
  const options = filterModels({ models, query, freeOnly, current: value });
  const nothingMatches = options.every((model) => model.id === value);
  return (
    <>
      <ModelFilters
        {...{ query, freeOnly, nothingMatches }}
        onQuery={setQuery}
        onFreeOnly={setFreeOnly}
      />
      <ModelSelect models={options} {...{ value, onChange, error }} />
    </>
  );
}

interface LoadModelsProps {
  /** Why the button waits, or null. */
  waitFor: MessageKey | null;
  busy: boolean;
  onLoad: () => void;
}

function WaitReason({ id, reason }: { id: string; reason: MessageKey }) {
  const { t } = useI18n();
  return (
    <span className="hint" id={id}>
      {t(reason)}
    </span>
  );
}

/** Ruling 22: the inactive button says why it waits, visibly and through aria-describedby. */
function LoadModels({ waitFor, busy, onLoad }: LoadModelsProps) {
  const { t } = useI18n();
  const reasonId = useId();
  return (
    <div className="model-load">
      <Button
        size="sm"
        busy={busy}
        inactive={waitFor !== null}
        aria-describedby={waitFor ? reasonId : undefined}
        onClick={onLoad}
      >
        {t("settings.ai.loadModels")}
      </Button>
      {waitFor ? <WaitReason id={reasonId} reason={waitFor} /> : null}
    </div>
  );
}

function waitReason({ keyStored, keyTyped }: ModelPickerProps): MessageKey | null {
  if (!keyStored) return "settings.ai.reason.no_key";
  return keyTyped ? "sources.notify.saveFirst" : null;
}

/** Fetched on request only; a removed key ends the request (fix round M4). */
function useModelList(keyStored: boolean) {
  const [requested, setRequested] = useState(false);
  if (requested && !keyStored) setRequested(false);
  const query = useQuery(openRouterModelsQueryOptions(requested && keyStored));
  const load = () => (requested ? void query.refetch() : setRequested(true));
  return { query, requested, load };
}

/**
 * D3: the model is a text field (any id can be typed) until "Modelle laden" fetched OpenRouter's
 * list; then the picker replaces it. Provider data is shown as option text only (preflight 5.10).
 */
export function ModelPicker(props: ModelPickerProps) {
  const { value, onChange, error } = props;
  const { t } = useI18n();
  const { query, requested, load } = useModelList(props.keyStored);
  if (query.data && props.keyStored)
    return (
      <ModelChoice models={query.data} afterLoad={requested} {...{ value, onChange, error }} />
    );
  return (
    <>
      <ModelField {...{ id: MODEL_ID, value, onChange, error }} />
      <LoadModels waitFor={waitReason(props)} busy={query.isFetching} onLoad={load} />
      {query.error ? (
        <Notice tone="error">
          <p>{describeModelsError(query.error, t)}</p>
        </Notice>
      ) : null}
    </>
  );
}
