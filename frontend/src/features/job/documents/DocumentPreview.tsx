"use client";

import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describeError } from "@/api/describeError";
import {
  DOCUMENT_KINDS,
  generatedDocument,
  jobDocumentsQueryOptions,
  type DocumentKind,
  type JobDocument,
} from "@/api/jobDocuments";
import type { JobDetail } from "@/api/jobs";
import { isGenerating } from "@/domain/jobStatus";
import { useI18n } from "@/i18n/useI18n";
import { A4Preview } from "@/ui/A4Preview";
import { Notice } from "@/ui/Notice";
import { Seg } from "@/ui/Seg";
import { useJobFormat } from "../format/useJobFormat";
import { DOCUMENT_LABEL } from "../labels";
import { DRIVE_UNSUPPORTED } from "./saveFile";
import { useDocumentFile, useObjectUrl } from "./useDocumentFile";

export interface DocumentPreviewProps {
  job: JobDetail;
  kind: DocumentKind;
  onKindChange: (kind: DocumentKind) => void;
  /** Replaces the PDF while the HTML is edited (Task 17). */
  editor?: ReactNode;
  busy?: boolean;
}

/** Prototype renderPreview: the seg is the only preview switch (usability #21). */
export function DocumentPreview({ job, kind, onKindChange, editor, busy }: DocumentPreviewProps) {
  const { t } = useI18n();
  const options = DOCUMENT_KINDS.map((value) => ({ value, label: t(DOCUMENT_LABEL[value]) }));
  const document = generatedDocument(useQuery(jobDocumentsQueryOptions(job.id)).data ?? [], kind);
  return (
    <div>
      <div className="preview-head">
        <h3 className="sec-title-sm">{t("preview.title")}</h3>
        <Seg options={options} value={kind} onChange={onKindChange} label={t("preview.switch")} />
      </div>
      <PreviewSheet
        job={job}
        kind={kind}
        document={document}
        editor={editor}
        busy={busy || isGenerating(job)}
      />
    </div>
  );
}

interface PreviewSheetProps {
  job: JobDetail;
  kind: DocumentKind;
  document?: JobDocument;
  editor?: ReactNode;
  busy: boolean;
}

function PreviewSheet({ job, kind, document, editor, busy }: PreviewSheetProps) {
  const { t } = useI18n();
  const file = useDocumentFile(job.id, document);
  const pdfUrl = useObjectUrl(file.data);
  if (file.isError)
    return <Notice tone="error">{describeError(file.error, t, DRIVE_UNSUPPORTED)}</Notice>;
  return (
    <A4Preview
      title={t(DOCUMENT_LABEL[kind])}
      pdfUrl={pdfUrl}
      downloadName={document?.original_filename}
      slug={<ProofSlug document={document} busy={busy} />}
      emptyText={t("preview.missing", { doc: t(DOCUMENT_LABEL[kind]) })}
      busy={busy}
    >
      {editor}
    </A4Preview>
  );
}

function ProofSlug({ document, busy }: { document?: JobDocument; busy: boolean }) {
  const { t } = useI18n();
  const format = useJobFormat();
  let state = t("preview.noProof");
  if (busy) state = t("preview.setting");
  else if (document?.uploaded_at)
    state = t("preview.proof", { date: format.dateTime(document.uploaded_at) });
  return (
    <>
      <b>{state}</b>
      <span>{document?.original_filename ?? ""}</span>
    </>
  );
}
