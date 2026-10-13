"use client";

import { useState } from "react";
import type { NotificationTemplate } from "@/api/notifications";
import { DrawerSection } from "@/features/sources/drawer/DrawerSection";
import type { ReportDirty } from "@/features/sources/drawer/useDirtySections";
import type { SectionForm } from "@/features/sources/drawer/useSectionForm";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { CheckField, TextAreaField, TextField } from "@/ui/Field";
import { Seg } from "@/ui/Seg";
import {
  contentTooLong,
  type TemplateDraft,
  type TemplateKind,
  type TemplateProblem,
  type TemplateProblems,
} from "./templateDraft";
import { TemplatePreviewDialog } from "./TemplatePreviewDialog";
import { useTemplateEditor } from "./useTemplateEditor";

export const TEMPLATE_EDITOR_ID = "settings-template-editor";
const NEW_HEADING_ID = `${TEMPLATE_EDITOR_ID}-new-h`;
const FIELD_ID = {
  name: "settings-template-name",
  content: "settings-template-content",
  global: "settings-template-global",
} as const;
const CONTENT_ROWS = 10;

export const KIND_LABEL: Readonly<Record<TemplateKind, MessageKey>> = {
  push: "sources.channel.pushover",
  email: "settings.templates.email",
};
const VARIABLES: Readonly<Record<TemplateKind, MessageKey>> = {
  push: "settings.templates.variablesPush",
  email: "settings.templates.variablesEmail",
};
const PROBLEM_TEXT: Readonly<Record<TemplateProblem, MessageKey>> = {
  required: "settings.problem.required",
  tooLong: "settings.problem.tooLong",
};

export interface TemplateEditorProps {
  /** null: "Neue Vorlage". */
  template: NotificationTemplate | null;
  isAdmin: boolean;
  /** The id of the row's visible name, which names an existing template's form. */
  nameId?: string;
  report: ReportDirty;
  onSaved: () => void;
  onClose: () => void;
}

interface FieldsProps {
  form: SectionForm<TemplateDraft>;
  problems: TemplateProblems;
  /** Ruling 46: the type is fixed after creation, and "Für alle Benutzer" is a creation choice. */
  creating: boolean;
  isAdmin: boolean;
}

const KINDS: readonly TemplateKind[] = ["push", "email"];

/** Creating: a seg; editing: read-only text, since the server keeps the type (ruling 46). */
function KindChoice({
  form,
  creating,
  label,
}: Pick<FieldsProps, "form" | "creating"> & { label: string }) {
  const { t } = useI18n();
  if (!creating) return <p className="template-kind">{t(KIND_LABEL[form.draft.kind])}</p>;
  const options = KINDS.map((kind) => ({ value: kind, label: t(KIND_LABEL[kind]) }));
  return (
    <Seg
      options={options}
      value={form.draft.kind}
      onChange={(kind) => form.set({ kind })}
      label={label}
    />
  );
}

function KindField({ form, creating }: Pick<FieldsProps, "form" | "creating">) {
  const { t } = useI18n();
  const label = t("settings.templates.kind");
  return (
    <div className="field">
      <span className="label">{label}</span>
      <KindChoice form={form} creating={creating} label={label} />
    </div>
  );
}

function ContentField({ form, problems }: Pick<FieldsProps, "form" | "problems">) {
  const { t } = useI18n();
  const variables = `${t("settings.templates.variables")}: ${t(VARIABLES[form.draft.kind])}`;
  return (
    <TextAreaField
      id={FIELD_ID.content}
      className="code"
      label={t("settings.templates.content")}
      hint={variables}
      rows={CONTENT_ROWS}
      spellCheck={false}
      value={form.draft.content}
      onChange={(event) => form.set({ content: event.target.value })}
      error={problems.content ? t(PROBLEM_TEXT[problems.content]) : undefined}
    />
  );
}

function NameField({ form, problems }: Pick<FieldsProps, "form" | "problems">) {
  const { t } = useI18n();
  return (
    <TextField
      id={FIELD_ID.name}
      label={t("settings.templates.name")}
      value={form.draft.name}
      onChange={(event) => form.set({ name: event.target.value })}
      error={problems.name ? t(PROBLEM_TEXT[problems.name]) : undefined}
    />
  );
}

function GlobalField({ form }: Pick<FieldsProps, "form">) {
  const { t } = useI18n();
  return (
    <CheckField
      id={FIELD_ID.global}
      label={t("settings.templates.forAll")}
      checked={form.draft.global}
      onChange={(global) => form.set({ global })}
    />
  );
}

function EditorFields({ form, problems, creating, isAdmin }: FieldsProps) {
  return (
    <>
      <NameField form={form} problems={problems} />
      <KindField form={form} creating={creating} />
      <ContentField form={form} problems={problems} />
      {creating && isAdmin ? <GlobalField form={form} /> : null}
    </>
  );
}

interface ActionsProps {
  draft: TemplateDraft;
  onClose: () => void;
}

/** Vorschau renders the current draft; it is inactive while the server would refuse the text. */
function PreviewButton({ draft }: { draft: TemplateDraft }) {
  const { t } = useI18n();
  const [previewing, setPreviewing] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        inactive={contentTooLong(draft)}
        onClick={() => setPreviewing(true)}
      >
        {t("preview.title")}
      </Button>
      {previewing ? (
        <TemplatePreviewDialog draft={draft} onClose={() => setPreviewing(false)} />
      ) : null}
    </>
  );
}

function EditorActions({ draft, onClose }: ActionsProps) {
  const { t } = useI18n();
  return (
    <div className="template-editor-actions">
      <PreviewButton draft={draft} />
      <Button variant="ghost" size="sm" onClick={onClose}>
        {t("dialog.close")}
      </Button>
    </div>
  );
}

/** The new template's form is named by its own h4; a stored one's by its row name. */
function NewHeading() {
  const { t } = useI18n();
  return (
    <h4 id={NEW_HEADING_ID} className="sec-title-sm">
      {t("settings.templates.new")}
    </h4>
  );
}

/** D8: name, kind, text with its placeholders, Vorschau and Speichern; one editor open at a time. */
export function TemplateEditor(props: TemplateEditorProps) {
  const { template, isAdmin, nameId, onClose } = props;
  const { form, problems, submit, busy } = useTemplateEditor(props);
  return (
    <div className="template-editor" id={TEMPLATE_EDITOR_ID}>
      {template ? null : <NewHeading />}
      <DrawerSection
        id={TEMPLATE_EDITOR_ID}
        // Unused: labelledBy always names the form (the row name or the h4), so no heading renders.
        title=""
        labelledBy={nameId ?? NEW_HEADING_ID}
        onSubmit={submit}
        busy={busy}
        dirty={form.dirty}
      >
        <EditorFields form={form} problems={problems} creating={!template} isAdmin={isAdmin} />
        <EditorActions draft={form.draft} onClose={onClose} />
      </DrawerSection>
    </div>
  );
}
