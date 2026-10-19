"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import { describeError } from "@/api/describeError";
import type { JobDocument } from "@/api/jobDocuments";
import { useI18n } from "@/i18n/useI18n";
import type { MessageKey } from "@/i18n/de";
import { PdfView } from "@/ui/A4Preview";
import { Notice } from "@/ui/Notice";
import { ViewerDialog } from "@/ui/ViewerDialog";
import { viewKind, type ViewKind } from "./uploadRules";
import { useDocumentFile, useObjectUrl } from "./useDocumentFile";

interface FileViewerProps {
  jobId: string;
  document: JobDocument;
  onClose: () => void;
}

/** The blob carries the stored type (pinned in useDocumentFile). */
export function FileViewer({ jobId, document, onClose }: FileViewerProps) {
  const file = useDocumentFile(jobId, viewKind(document.mime_type) ? document : undefined);
  return (
    <FileViewerDialog
      name={document.original_filename}
      mimeType={document.mime_type}
      file={file}
      onClose={onClose}
    />
  );
}

interface FileViewerDialogProps extends FileViewerBodyProps {
  onClose: () => void;
}

const VIEW_KIND_LABEL: Record<ViewKind, MessageKey> = {
  pdf: "viewer.kind.pdf",
  image: "viewer.kind.image",
  text: "viewer.kind.text",
};

/** The shared large viewer; the toolbar names the file and its kind. */
export function FileViewerDialog({ onClose, ...body }: FileViewerDialogProps) {
  const { t } = useI18n();
  const kind = viewKind(body.mimeType);
  return (
    <ViewerDialog
      title={body.name}
      subtitle={kind ? t(VIEW_KIND_LABEL[kind]) : undefined}
      onClose={onClose}
    >
      <FileViewerBody {...body} />
    </ViewerDialog>
  );
}

interface FileViewerBodyProps {
  name: string;
  mimeType?: string | null;
  /** The bytes typed with the stored mime type; not fetched for a file without a viewer. */
  file: UseQueryResult<Blob>;
}

/** The viewer's content, shared by the job page and Profil › Nachweise (preflight ruling 16). */
export function FileViewerBody({ name, mimeType, file }: FileViewerBodyProps) {
  const { t } = useI18n();
  const kind = viewKind(mimeType);
  const url = useObjectUrl(file.data);
  if (!kind) return <p className="prose">{t("files.noPreview")}</p>;
  if (file.isError) {
    return <Notice tone="error">{describeError(file.error, t)}</Notice>;
  }
  if (!url) return <p className="prose">{t("loading")}</p>;
  return <FileContent kind={kind} url={url} name={name} />;
}

interface FileContentProps {
  kind: ViewKind;
  url: string;
  name: string;
}

function FileContent({ kind, url, name }: FileContentProps) {
  if (kind === "pdf") return <PdfView title={name} pdfUrl={url} downloadName={name} />;
  if (kind === "text") {
    return <object className="file-text" type="text/plain" data={url} aria-label={name} />;
  }
  return <img className="file-image" src={url} alt={name} />;
}
