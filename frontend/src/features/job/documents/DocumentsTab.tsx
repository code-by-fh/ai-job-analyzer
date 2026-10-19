"use client";

import { Eye, FileText, Pencil, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DOCUMENT_KINDS, jobDocumentsQueryOptions, type DocumentKind } from "@/api/jobDocuments";
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
import { hasPdf } from "./downloadPdf";
import { useAttachChoice } from "./useAttachChoice";
import { useDocumentEdit } from "./useDocumentEdit";
import { useEditSource, type EditSource } from "./useEditSource";
import { useGeneration } from "./useGeneration";

type DocumentEdit = ReturnType<typeof useDocumentEdit>;

/** "Bewerbungsmappe": the document rows side by side; a preview opens on click and doubles as the editing sheet. */
export function DocumentsTab({ job }: { job: JobDetail }) {
  const [preview, setPreview] = useState<DocumentKind | null>(null);
  const edit = useDocumentEdit(job);
  const startEdit = (kind: DocumentKind) => {
    void edit.start(kind).then((started) => started && setPreview(kind));
  };
  // Closing while editing would drop the edit, so it asks like "Verwerfen".
  const closePreview = () => {
    void edit.stop().then((left) => left && setPreview(null));
  };
  return (
    <div className="mappe">
      <MappeColumn job={job} onEdit={startEdit} onPreview={setPreview} />
      {preview ? (
        <PreviewModal job={job} kind={preview} edit={edit} onClose={closePreview} />
      ) : null}
    </div>
  );
}

interface MappeColumnProps {
  job: JobDetail;
  onEdit: (kind: DocumentKind) => void;
  onPreview: (kind: DocumentKind) => void;
}

function MappeColumn({ job, onEdit, onPreview }: MappeColumnProps) {
  const { t } = useI18n();
  const [attach, setAttach] = useAttachChoice(job.id);
  return (
    <div>
      <MappeHead job={job} attach={attach} />
      <p className="prose small">{t("docs.intro")}</p>
      <GenerationNote job={job} />
      <DocumentRows job={job} attach={attach} onEdit={onEdit} onPreview={onPreview} />
      <AttachProfileDocuments attach={attach} onChange={setAttach} />
      <FilesSection job={job} />
    </div>
  );
}

interface DocumentRowsProps {
  job: JobDetail;
  attach: boolean;
  onEdit: (kind: DocumentKind) => void;
  onPreview: (kind: DocumentKind) => void;
}

function DocumentRows({ job, attach, onEdit, onPreview }: DocumentRowsProps) {
  return (
    <div className="docrows">
      {DOCUMENT_KINDS.map((kind) => (
        <DocumentRow
          key={kind}
          job={job}
          kind={kind}
          attach={attach}
          actions={<RowActions job={job} kind={kind} onEdit={onEdit} onPreview={onPreview} />}
        />
      ))}
    </div>
  );
}

interface RowActionsProps {
  job: JobDetail;
  kind: DocumentKind;
  onEdit: (kind: DocumentKind) => void;
  onPreview: (kind: DocumentKind) => void;
}

function PreviewButton({ onClick }: { onClick: () => void }) {
  const { t } = useI18n();
  return (
    <Button size="sm" icon={Eye} onClick={onClick}>
      {t("docs.preview")}
    </Button>
  );
}

/** Whether the stored HTML can be edited now: it exists and no generation rewrites it. */
function canEdit(job: JobDetail, kind: DocumentKind): boolean {
  return documentPresence(job)[kind] && !isGenerating(job);
}

function RowActions({ job, kind, onEdit, onPreview }: RowActionsProps) {
  const { t } = useI18n();
  const documents = useQuery(jobDocumentsQueryOptions(job.id)).data ?? [];
  // A job generated before Task 12 may have only its stored PDF; it is shown, not edited.
  const viewable = hasPdf({ job, kind, documents, label: t(DOCUMENT_LABEL[kind]) });
  return (
    <>
      {viewable ? <PreviewButton onClick={() => onPreview(kind)} /> : null}
      {canEdit(job, kind) ? <EditButton onClick={() => onEdit(kind)} /> : null}
      <DownloadButton job={job} kind={kind} />
    </>
  );
}

function EditButton({ onClick }: { onClick: () => void }) {
  const { t } = useI18n();
  return (
    <Button size="sm" icon={Pencil} onClick={onClick}>
      {t("edit.start")}
    </Button>
  );
}

interface PreviewModalProps {
  job: JobDetail;
  kind: DocumentKind;
  edit: DocumentEdit;
  onClose: () => void;
}

function PreviewModal({ job, kind, edit, onClose }: PreviewModalProps) {
  const editing = edit.editing === kind;
  const source = useEditSource(job.id, kind, editing);
  const { t } = useI18n();
  return (
    <DocumentPreview
      job={job}
      kind={kind}
      onClose={onClose}
      editor={editing ? <EditorSheet kind={kind} source={source} edit={edit} /> : undefined}
      actions={<PreviewActions job={job} kind={kind} edit={edit} />}
      notice={
        editing && source.changed ? <Notice tone="warn">{t("edit.changedOnServer")}</Notice> : null
      }
    />
  );
}

/** While editing: save and discard; otherwise edit (when possible) and download. */
function PreviewActions({ job, kind, edit }: Omit<PreviewModalProps, "onClose">) {
  if (edit.editing === kind) return <EditActions edit={edit} />;
  return (
    <>
      {canEdit(job, kind) ? <EditButton onClick={() => void edit.start(kind)} /> : null}
      <DownloadButton job={job} kind={kind} />
    </>
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

function EditActions({ edit }: { edit: DocumentEdit }) {
  const { t } = useI18n();
  return (
    <>
      <Button size="sm" variant="primary" busy={edit.saving} onClick={edit.save}>
        {t("edit.save")}
      </Button>
      <Button size="sm" variant="ghost" onClick={edit.stop}>
        {t("edit.discard")}
      </Button>
    </>
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
