"use client";

import type { ReactNode } from "react";
import { describeError } from "@/api/describeError";
import type { DocumentKind, JobDocument } from "@/api/jobDocuments";
import type { JobDetail } from "@/api/jobs";
import { isGenerating } from "@/domain/jobStatus";
import { PreviewFrame } from "@/features/profile/templates/TemplatePreview";
import { useI18n } from "@/i18n/useI18n";
import { A4Preview } from "@/ui/A4Preview";
import { Notice } from "@/ui/Notice";
import { ViewerDialog } from "@/ui/ViewerDialog";
import { useJobFormat } from "../format/useJobFormat";
import { DOCUMENT_LABEL } from "../labels";
import { usePreviewSource, type PreviewSource } from "./usePreviewSource";

export interface DocumentPreviewProps {
  job: JobDetail;
  kind: DocumentKind;
  onClose: () => void;
  /** Replaces the document on the sheet while its HTML is edited. */
  editor?: ReactNode;
  /** Toolbar buttons: edit or save and discard, download. */
  actions?: ReactNode;
  /** Between the toolbar and the sheet, e.g. that the stored document changed. */
  notice?: ReactNode;
}

/**
 * The A4 sheet of one document in the large viewer; opened on click, never permanently shown.
 * The toolbar names the job's company, or while editing how to edit.
 */
export function DocumentPreview(props: DocumentPreviewProps) {
  const { job, kind, onClose, editor, actions, notice } = props;
  const { t } = useI18n();
  const title = t(DOCUMENT_LABEL[kind]);
  const source = usePreviewSource(job, kind);
  const subtitle = editor ? t("edit.hint") : (job.company ?? undefined);
  return (
    <ViewerDialog
      title={title}
      subtitle={subtitle}
      actions={actions}
      notice={notice}
      onClose={onClose}
    >
      <PreviewSheet title={title} source={source} editor={editor} busy={isGenerating(job)} />
    </ViewerDialog>
  );
}

interface PreviewSheetProps {
  title: string;
  source: PreviewSource;
  editor?: ReactNode;
  busy: boolean;
}

/**
 * Task 12: the HTML is shown read-only in the template preview's frame (empty sandbox, no
 * scripts, active content and link targets stripped, editor CSP); the PDF exists only on download.
 */
function PreviewSheet({ title, source, editor, busy }: PreviewSheetProps) {
  const { t } = useI18n();
  if (source.type === "failed")
    return <Notice tone="error">{describeError(source.error, t)}</Notice>;
  const html = source.type === "html" ? source.html : undefined;
  const sheet = html ? <PreviewFrame html={html} title={title} /> : undefined;
  return (
    <A4Preview
      title={title}
      pdfUrl={source.type === "pdf" ? source.url : null}
      downloadName={source.type === "pdf" ? source.document?.original_filename : undefined}
      slug={<SheetSlug source={source} busy={busy} />}
      fit="page"
      emptyText={t("preview.missing", { doc: title })}
      busy={busy || (source.type === "html" && html === undefined)}
    >
      {editor ?? sheet}
    </A4Preview>
  );
}

type ShownSource = Exclude<PreviewSource, { type: "failed" }>;

function SheetSlug({ source, busy }: { source: ShownSource; busy: boolean }) {
  const { t } = useI18n();
  if (source.type === "html")
    return (
      <>
        <b>{t(busy ? "preview.setting" : "preview.editable")}</b>
        <span>{t("preview.pdfOnDownload")}</span>
      </>
    );
  return <ProofSlug document={source.document} busy={busy} />;
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
