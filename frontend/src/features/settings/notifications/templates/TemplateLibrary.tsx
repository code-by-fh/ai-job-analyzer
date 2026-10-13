"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { notificationTemplatesQueryOptions, type NotificationTemplate } from "@/api/notifications";
import { SectionState } from "@/features/profile/SectionState";
import { useCurrentUser } from "@/features/shell/useCurrentUser";
import { templatesFor } from "@/features/sources/drawer/notifyDraft";
import type { ReportDirty } from "@/features/sources/drawer/useDirtySections";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { closeThenFocus } from "@/ui/focus";
import { Notice } from "@/ui/Notice";
import { Tag } from "@/ui/Tag";
import { useUnsavedChanges } from "@/ui/UnsavedChanges";
import { settingsHeadingId } from "../../labels";
import { DeleteNotificationTemplateDialog } from "./DeleteNotificationTemplateDialog";
import { canEdit, type TemplateKind } from "./templateDraft";
import { KIND_LABEL, TEMPLATE_EDITOR_ID, TemplateEditor } from "./TemplateEditor";

/** Which editor is open: a stored template's id, the new one, or none (ruling 46). */
type Editing = number | "new" | null;
type Opener = Exclude<Editing, null>;

const TITLE_ID = "settings-templates-h";
const NEW_ID = "settings-template-new";
const rowId = (id: number, part: string) => `settings-template-${id}-${part}`;
const openerId = (opener: Opener) => (opener === "new" ? NEW_ID : rowId(opener, "edit"));
// The drawer's channels list the templates per kind: Pushover, and every email type together.
const KIND_CHANNEL = { push: "PUSHOVER", email: "RESEND" } as const;
const KINDS: readonly TemplateKind[] = ["push", "email"];

const sectionHeading = () => document.getElementById(settingsHeadingId("notifications"));

/** The editor's dirty flag on its way to the page's reporter, kept for the switch question. */
function useTrackedDirty(report: ReportDirty) {
  const dirty = useRef(false);
  const tracked = useCallback<ReportDirty>(
    (id, value) => {
      dirty.current = value;
      report(id, value);
    },
    [report],
  );
  return { dirty, report: tracked };
}

/**
 * Ruling 46 (as 42): one editor open. Switching or closing asks only while the open draft is dirty;
 * after a save or a close focus goes to the opener before the editor unmounts.
 */
function useEditors(pageReport: ReportDirty) {
  const { requestLeave } = useUnsavedChanges();
  const [editing, setEditing] = useState<Editing>(null);
  const { dirty, report } = useTrackedDirty(pageReport);
  const mayLeave = async () => !dirty.current || (await requestLeave());
  const toggle = async (opener: Opener) => {
    if (await mayLeave()) setEditing((current) => (current === opener ? null : opener));
  };
  const done = () => {
    if (editing !== null) document.getElementById(openerId(editing))?.focus();
    setEditing(null);
  };
  const close = async () => {
    if (await mayLeave()) done();
  };
  return { editing, toggle, done, close, clear: () => setEditing(null), report };
}

type Editors = ReturnType<typeof useEditors>;

interface LibraryContext {
  isAdmin: boolean;
  editors: Editors;
  askDelete: (template: NotificationTemplate) => void;
}

function OpenEditor({
  template,
  ctx,
}: {
  template: NotificationTemplate | null;
  ctx: LibraryContext;
}) {
  const { editors } = ctx;
  return (
    <TemplateEditor
      template={template}
      isAdmin={ctx.isAdmin}
      nameId={template ? rowId(template.id, "name") : undefined}
      report={editors.report}
      onSaved={editors.done}
      onClose={() => void editors.close()}
    />
  );
}

interface RowProps {
  template: NotificationTemplate;
  ctx: LibraryContext;
}

function EditButton({ template, ctx }: RowProps) {
  const { t } = useI18n();
  const open = ctx.editors.editing === template.id;
  return (
    <Button
      id={rowId(template.id, "edit")}
      size="sm"
      aria-label={t("settings.templates.edit", { name: template.name })}
      aria-expanded={open}
      aria-controls={open ? TEMPLATE_EDITOR_ID : undefined}
      onClick={() => void ctx.editors.toggle(template.id)}
    >
      {t("edit.start")}
    </Button>
  );
}

function RowActions({ template, ctx }: RowProps) {
  const { t } = useI18n();
  return (
    <div className="template-actions">
      <EditButton template={template} ctx={ctx} />
      <Button
        variant="ghost"
        size="sm"
        aria-label={t("settings.templates.delete", { name: template.name })}
        onClick={() => ctx.askDelete(template)}
      >
        {t("files.deleteConfirm")}
      </Button>
    </div>
  );
}

/** Name as React text, "Für alle" for a global one; buttons only where the user may change it. */
function TemplateRow({ template, ctx }: RowProps) {
  const { t } = useI18n();
  return (
    <li className="template-row">
      <span className="template-name" id={rowId(template.id, "name")}>
        {template.name}
      </span>
      {template.is_admin ? <Tag>{t("settings.templates.global")}</Tag> : null}
      {canEdit(template, ctx.isAdmin) ? <RowActions template={template} ctx={ctx} /> : null}
      {ctx.editors.editing === template.id ? <OpenEditor template={template} ctx={ctx} /> : null}
    </li>
  );
}

interface GroupProps {
  kind: TemplateKind;
  templates: readonly NotificationTemplate[];
  ctx: LibraryContext;
}

function TemplateGroup({ kind, templates, ctx }: GroupProps) {
  const { t } = useI18n();
  const headingId = `settings-templates-${kind}-h`;
  return (
    <div className="template-group">
      <h4 id={headingId} className="template-group-title">
        {t(KIND_LABEL[kind])}
      </h4>
      <ul role="list" className="template-list" aria-labelledby={headingId}>
        {templates.map((template) => (
          <TemplateRow key={template.id} template={template} ctx={ctx} />
        ))}
      </ul>
    </div>
  );
}

/** Ruling 45: an empty library is a hint, not EmptyState (its h2 would break the outline). */
function TemplateGroups({
  templates,
  ctx,
}: {
  templates: NotificationTemplate[];
  ctx: LibraryContext;
}) {
  const { t } = useI18n();
  const groups = KINDS.map((kind) => ({
    kind,
    items: templatesFor(KIND_CHANNEL[kind], templates),
  }));
  const filled = groups.filter((group) => group.items.length > 0);
  if (filled.length === 0) return <p className="hint">{t("settings.templates.empty")}</p>;
  return filled.map((group) => (
    <TemplateGroup key={group.kind} kind={group.kind} templates={group.items} ctx={ctx} />
  ));
}

function NewTemplate({ ctx }: { ctx: LibraryContext }) {
  const { t } = useI18n();
  const open = ctx.editors.editing === "new";
  return (
    <div className="template-new">
      <Button
        id={NEW_ID}
        aria-expanded={open}
        aria-controls={open ? TEMPLATE_EDITOR_ID : undefined}
        onClick={() => void ctx.editors.toggle("new")}
      >
        {t("settings.templates.new")}
      </Button>
      {open ? <OpenEditor template={null} ctx={ctx} /> : null}
    </div>
  );
}

/**
 * A delete closes that template's editor too; the deleted row's button is gone, so focus then
 * moves to the heading (ruling 20).
 */
function useDeletion(editors: Editors) {
  const [deleting, setDeleting] = useState<NotificationTemplate | null>(null);
  const close = () => {
    if (deleting && editors.editing === deleting.id) editors.clear();
    setDeleting(null);
  };
  const deleted = () => closeThenFocus(close, sectionHeading);
  return { deleting, ask: setDeleting, cancel: () => setDeleting(null), deleted };
}

function PendingDeletion({ deletion }: { deletion: ReturnType<typeof useDeletion> }) {
  if (!deletion.deleting) return null;
  return (
    <DeleteNotificationTemplateDialog
      template={deletion.deleting}
      onDeleted={deletion.deleted}
      onClose={deletion.cancel}
    />
  );
}

/** R1: a source keeps the copy it took, which the notice above the list says. */
function LibraryHead() {
  const { t } = useI18n();
  return (
    <>
      <h3 id={TITLE_ID} className="sec-title-sm">
        {t("settings.templates.title")}
      </h3>
      <p className="hint template-intro">{t("settings.templates.intro")}</p>
      <Notice tone="info">{t("settings.templates.copyHint")}</Notice>
    </>
  );
}

/** D8 (G10): the notification texts per kind, with one editor and one delete question at a time. */
export function TemplateLibrary({ report }: { report: ReportDirty }) {
  const query = useQuery(notificationTemplatesQueryOptions());
  const isAdmin = useCurrentUser().data?.is_admin ?? false;
  const editors = useEditors(report);
  const deletion = useDeletion(editors);
  const ctx: LibraryContext = { isAdmin, editors, askDelete: deletion.ask };
  return (
    <section className="settings-block" aria-labelledby={TITLE_ID}>
      <LibraryHead />
      <SectionState query={query}>
        {(templates) => <TemplateGroups templates={templates} ctx={ctx} />}
      </SectionState>
      <NewTemplate ctx={ctx} />
      <PendingDeletion deletion={deletion} />
    </section>
  );
}
