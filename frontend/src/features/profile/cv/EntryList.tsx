"use client";

import { CircleAlert, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { flushSync } from "react-dom";
import { PROFILE_LIMITS } from "@/api/profilePaths";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { TextAreaField, TextField } from "@/ui/Field";
import { Icon } from "@/ui/Icon";
import type { EntryField, EntrySummary } from "./entryFields";

/** The refusal key of a list that holds too many entries (a legacy row). */
export const LIST_REFUSED = "list";
const DESCRIPTION_ROWS = 3;

export interface EntryListProps<T extends Record<string, string>> {
  id: string;
  title: string;
  /** What the add button says, e.g. "Erfahrung hinzufügen": two lists, two distinct names. */
  addLabel: MessageKey;
  entries: readonly T[];
  fields: readonly EntryField<T>[];
  empty: T;
  summary: (entry: T) => EntrySummary;
  onChange: (entries: T[]) => void;
  /** The server's 422 within this list: "3.description" for a field, LIST_REFUSED for the list. */
  refused: readonly string[];
}

interface EntryActions<T> {
  add: () => void;
  open: (index: number) => void;
  close: (index: number) => void;
  update: (index: number, entry: T) => void;
  remove: (index: number) => void;
}

const addButtonId = (listId: string) => `${listId}-add`;
/** The list heading; focusable, so a control that disappears can hand focus to it. */
export const listHeadingId = (listId: string) => `${listId}-h`;
const editButtonId = (listId: string, index: number) => `${listId}-${index}-edit`;
const fieldId = (listId: string, index: number, key: string) => `${listId}-${index}-${key}`;

/**
 * The control that started an action disappears with it; the next place to act takes the focus
 * once React has rendered it (Global Constraints, Focus).
 */
function focusAfter(update: () => void, targetId: string): void {
  flushSync(update);
  document.getElementById(targetId)?.focus();
}

function firstFieldId<T extends Record<string, string>>(props: EntryListProps<T>, index: number) {
  return fieldId(props.id, index, props.fields[0]!.key);
}
const without = <T,>(entries: readonly T[], index: number) =>
  entries.filter((_entry, position) => position !== index);
const replaced = <T,>(entries: readonly T[], index: number, entry: T) =>
  entries.map((current, position) => (position === index ? entry : current));

function useEntryActions<T extends Record<string, string>>(
  props: EntryListProps<T>,
  setEditing: (index: number | null) => void,
): EntryActions<T> {
  const { id, entries, onChange } = props;
  const changeAndEdit = (next: T[], index: number | null) => () => {
    onChange(next);
    setEditing(index);
  };
  const appended = changeAndEdit([...entries, { ...props.empty }], entries.length);
  return {
    add: () => focusAfter(appended, firstFieldId(props, entries.length)),
    open: (index) => focusAfter(() => setEditing(index), firstFieldId(props, index)),
    close: (index) => focusAfter(() => setEditing(null), editButtonId(id, index)),
    update: (index, entry) => onChange(replaced(entries, index, entry)),
    remove: (index) => focusAfter(changeAndEdit(without(entries, index), null), addButtonId(id)),
  };
}

/** D5: entries are drafts of the Lebenslauf form; its Speichern stores them. */
export function EntryList<T extends Record<string, string>>(props: EntryListProps<T>) {
  const [editing, setEditing] = useState<number | null>(null);
  const actions = useEntryActions(props, setEditing);
  return (
    <section className="entry-list" aria-labelledby={listHeadingId(props.id)}>
      <ListHead {...props} onAdd={actions.add} />
      <Entries {...props} editing={editing} actions={actions} />
    </section>
  );
}

/** h4: the lists sit inside the form whose own heading is the h3. */
function ListHead<T extends Record<string, string>>(
  props: EntryListProps<T> & { onAdd: () => void },
) {
  const { t } = useI18n();
  return (
    <>
      <div className="section-head entry-list-head">
        <h4 id={listHeadingId(props.id)} className="sec-title-sm" tabIndex={-1}>
          {props.title}
        </h4>
        <AddButton {...props} />
      </div>
      {props.refused.includes(LIST_REFUSED) ? (
        <RefusedLine text={t("profile.cv.full", { max: PROFILE_LIMITS.cvEntries })} />
      ) : null}
    </>
  );
}

/** Inactive (still focusable) once the list holds as many entries as the server takes. */
function AddButton<T extends Record<string, string>>(
  props: EntryListProps<T> & { onAdd: () => void },
) {
  const { t } = useI18n();
  const full = props.entries.length >= PROFILE_LIMITS.cvEntries;
  return (
    <Button
      id={addButtonId(props.id)}
      size="sm"
      icon={Plus}
      inactive={full}
      title={full ? t("profile.cv.full", { max: PROFILE_LIMITS.cvEntries }) : undefined}
      onClick={props.onAdd}
    >
      {t(props.addLabel)}
    </Button>
  );
}

/** A server refusal shown next to what it is about; the form's notice announces it once. */
function RefusedLine({ text }: { text: string }) {
  return (
    <p className="field-error">
      <Icon icon={CircleAlert} />
      <span>{text}</span>
    </p>
  );
}

interface EntriesProps<T extends Record<string, string>> extends EntryListProps<T> {
  editing: number | null;
  actions: EntryActions<T>;
}

function Entries<T extends Record<string, string>>(props: EntriesProps<T>) {
  const { t } = useI18n();
  if (props.entries.length === 0) return <p className="meta">{t("profile.cv.none")}</p>;
  // Index keys: entries have no id, and the editor closes whenever one is removed.
  return (
    <ol role="list" className="entries">
      {props.entries.map((entry, index) =>
        props.editing === index ? (
          <EntryEditor key={index} {...props} entry={entry} index={index} />
        ) : (
          <EntryView key={index} {...props} entry={entry} index={index} />
        ),
      )}
    </ol>
  );
}

type EntryProps<T extends Record<string, string>> = EntriesProps<T> & { entry: T; index: number };

function EntryView<T extends Record<string, string>>(props: EntryProps<T>) {
  const { t } = useI18n();
  const summary = props.summary(props.entry);
  const title = summary.title.trim() || t("profile.cv.untitled");
  const refused = props.refused.some((path) => path.startsWith(`${props.index}.`));
  return (
    <li className="entry">
      <div className="entry-body">
        <div className="entry-title">{title}</div>
        {summary.sub ? <div className="entry-sub">{summary.sub}</div> : null}
        {summary.text ? <p className="entry-text">{summary.text}</p> : null}
        {refused ? <RefusedLine text={t("profile.cv.entryRefused")} /> : null}
      </div>
      <EditButton {...props} title={title} />
    </li>
  );
}

function EditButton<T extends Record<string, string>>(props: EntryProps<T> & { title: string }) {
  const { t } = useI18n();
  return (
    <Button
      id={editButtonId(props.id, props.index)}
      size="sm"
      variant="ghost"
      icon={Pencil}
      aria-label={t("profile.cv.edit", { title: props.title })}
      onClick={() => props.actions.open(props.index)}
    >
      {t("profile.cv.editShort")}
    </Button>
  );
}

function EntryEditor<T extends Record<string, string>>(props: EntryProps<T>) {
  return (
    <li className="entry entry-editing">
      <div className="entry-fields">
        {props.fields.map((field) => (
          <EntryInput key={field.key} {...props} field={field} />
        ))}
      </div>
      <EditorActions actions={props.actions} index={props.index} />
    </li>
  );
}

function EditorActions<T>({ actions, index }: { actions: EntryActions<T>; index: number }) {
  const { t } = useI18n();
  return (
    <div className="row entry-actions">
      <Button size="sm" onClick={() => actions.close(index)}>
        {t("profile.cv.done")}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => actions.remove(index)}>
        {t("profile.cv.remove")}
      </Button>
    </div>
  );
}

type EntryInputProps<T extends Record<string, string>> = EntryProps<T> & { field: EntryField<T> };

/** Label, hint, limit and the server's refusal of one entry field. */
function useInputProps<T extends Record<string, string>>(props: EntryInputProps<T>) {
  const { t } = useI18n();
  const { field, entry, index } = props;
  const refused = props.refused.includes(`${index}.${field.key}`);
  return {
    id: fieldId(props.id, index, field.key),
    label: t(field.label),
    hint: field.hint ? t(field.hint) : undefined,
    error: refused ? t("profile.error.tooLong") : undefined,
    maxLength: field.max,
    value: entry[field.key],
  };
}

function EntryInput<T extends Record<string, string>>(props: EntryInputProps<T>) {
  const shared = useInputProps(props);
  const { field, entry, index } = props;
  const change = (value: string) => props.actions.update(index, { ...entry, [field.key]: value });
  if (field.multiline)
    return (
      <TextAreaField
        {...shared}
        rows={DESCRIPTION_ROWS}
        onChange={(event) => change(event.target.value)}
      />
    );
  return <TextField {...shared} onChange={(event) => change(event.target.value)} />;
}
