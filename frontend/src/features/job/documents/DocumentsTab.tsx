"use client";

import { FileText, Pencil, RefreshCw } from "lucide-react";
import { useState } from "react";
import { DOCUMENT_KINDS, type DocumentKind } from "@/api/jobDocuments";
import type { JobDetail } from "@/api/jobs";
import { documentPresence, documentsReady } from "@/domain/documents";
import { isGenerating } from "@/domain/jobStatus";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { Notice } from "@/ui/Notice";
import { DOCUMENT_LABEL } from "../labels";
import { AttachProfileDocuments } from "./AttachProfileDocuments";
import { DocumentEditor } from "./DocumentEditor";
import { DocumentPreview } from "./DocumentPreview";
import { DocumentRow } from "./DocumentRow";
import { DownloadButton } from "./DownloadButton";
import { FilesSection } from "./FilesSection";
import { GenerationNote } from "./GenerationNote";
import { RenderStatus, useRenderRunning } from "./RenderStatus";
import { useAttachChoice } from "./useAttachChoice";
import { useDocumentEdit } from "./useDocumentEdit";
import { useEditSource, type EditSource } from "./useEditSource";
import { useGeneration } from "./useGeneration";

type DocumentEdit = ReturnType<typeof useDocumentEdit>;

/** "Bewerbungsmappe": document rows left, the A4 proof right; the proof is also the editing sheet. */
export function DocumentsTab({ job }: { job: JobDetail }) {
  const [preview, setPreview] = useState<DocumentKind>("cv");
  const edit = useDocumentEdit(job);
  const startEdit = (kind: DocumentKind) => {
    void edit.start(kind).then((started) => started && setPreview(kind));
  };
  // Switching the preview while editing would drop the edit, so it asks like "Verwerfen".
  const switchPreview = (kind: DocumentKind) => {
    void edit.stop().then((left) => left && setPreview(kind));
  };
  return (
    <div className="mappe">
      <MappeColumn job={job} onEdit={startEdit} />
      <PreviewColumn job={job} preview={preview} onPreview={switchPreview} edit={edit} />
    </div>
  );
}

function MappeColumn({ job, onEdit }: { job: JobDetail; onEdit: (kind: DocumentKind) => void }) {
  const { t } = useI18n();
  const [attach, setAttach] = useAttachChoice(job.id);
  return (
    <div>
      <MappeHead job={job} attach={attach} />
      <p className="prose small">{t("docs.intro")}</p>
      <GenerationNote job={job} />
      <DocumentRows job={job} attach={attach} onEdit={onEdit} />
      <AttachProfileDocuments attach={attach} onChange={setAttach} />
      <FilesSection job={job} />
    </div>
  );
}

interface DocumentRowsProps {
  job: JobDetail;
  attach: boolean;
  onEdit: (kind: DocumentKind) => void;
}

function DocumentRows({ job, attach, onEdit }: DocumentRowsProps) {
  return DOCUMENT_KINDS.map((kind) => (
    <DocumentRow
      key={kind}
      job={job}
      kind={kind}
      attach={attach}
      actions={<RowActions job={job} kind={kind} onEdit={onEdit} />}
    />
  ));
}

interface RowActionsProps {
  job: JobDetail;
  kind: DocumentKind;
  onEdit: (kind: DocumentKind) => void;
}

function RowActions({ job, kind, onEdit }: RowActionsProps) {
  const { t } = useI18n();
  const editable = documentPresence(job)[kind] && !isGenerating(job);
  return (
    <>
      {editable ? (
        <Button size="sm" icon={Pencil} onClick={() => onEdit(kind)}>
          {t("edit.start")}
        </Button>
      ) : null}
      <DownloadButton job={job} kind={kind} />
      <RenderStatus job={job} kind={kind} />
    </>
  );
}

interface PreviewColumnProps {
  job: JobDetail;
  preview: DocumentKind;
  onPreview: (kind: DocumentKind) => void;
  edit: DocumentEdit;
}

function PreviewColumn({ job, preview, onPreview, edit }: PreviewColumnProps) {
  const editing = edit.editing === preview;
  const rendering = useRenderRunning(job.id, preview);
  const source = useEditSource(job.id, preview, editing);
  return (
    <div>
      <DocumentPreview
        job={job}
        kind={preview}
        onKindChange={onPreview}
        busy={rendering}
        editor={editing ? <EditorSheet kind={preview} source={source} edit={edit} /> : undefined}
      />
      {editing ? <EditBar edit={edit} changed={source.changed} /> : null}
    </div>
  );
}

interface EditorSheetProps {
  kind: DocumentKind;
  source: EditSource;
  edit: DocumentEdit;
}

function EditorSheet({ kind, source, edit }: EditorSheetProps) {
  const { t } = useI18n();
  if (source.html === undefined) return <p className="pp-blank">{t("loading")}</p>;
  const title = t("edit.frameTitle", { doc: t(DOCUMENT_LABEL[kind]) });
  const { frameRef, markDirty } = edit;
  return <DocumentEditor html={source.html} title={title} frameRef={frameRef} onEdit={markDirty} />;
}

function EditBar({ edit, changed }: { edit: DocumentEdit; changed: boolean }) {
  const { t } = useI18n();
  return (
    <div className="edit-bar">
      {changed ? <Notice tone="warn">{t("edit.changedOnServer")}</Notice> : null}
      <Button size="sm" variant="primary" busy={edit.saving} onClick={edit.save}>
        {t("edit.save")}
      </Button>
      <Button size="sm" variant="ghost" onClick={edit.stop}>
        {t("edit.discard")}
      </Button>
      <span>{t("edit.hint")}</span>
    </div>
  );
}

function MappeHead({ job, attach }: { job: JobDetail; attach: boolean }) {
  const { t } = useI18n();
  const generation = useGeneration(job);
  const ready = documentsReady(documentPresence(job));
  return (
    <div className="mappe-head">
      <h3 className="sec-title">{t("docs.title")}</h3>
      <Button
        size="sm"
        icon={ready ? RefreshCw : FileText}
        disabled={isGenerating(job)}
        busy={generation.starting}
        onClick={() => generation.start({ kind: "both", includeProfileDocuments: attach })}
      >
        {t(ready ? "docs.recreateBoth" : "docs.createBoth")}
      </Button>
    </div>
  );
}
