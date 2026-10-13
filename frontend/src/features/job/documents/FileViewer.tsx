"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import { describeError } from "@/api/describeError";
import type { JobDocument } from "@/api/jobDocuments";
import { useI18n } from "@/i18n/useI18n";
import { A4Preview } from "@/ui/A4Preview";
import { Dialog } from "@/ui/Dialog";
import { Notice } from "@/ui/Notice";
import { PanelHeader } from "@/ui/PanelHeader";
import { DRIVE_UNSUPPORTED } from "./saveFile";
import { viewKind } from "./uploadRules";
import { useDocumentFile, useObjectUrl } from "./useDocumentFile";

interface FileViewerProps {
  jobId: string;
  document: JobDocument;
  onClose: () => void;
}

/** PDF on the A4 sheet, images and text inline; the blob carries the stored type (pinned in useDocumentFile). */
export function FileViewer({ jobId, document, onClose }: FileViewerProps) {
  return (
    <Dialog open onClose={onClose} label={document.original_filename}>
      <div className="panel-in">
        <PanelHeader title={document.original_filename} onClose={onClose} />
        <ViewerBody jobId={jobId} document={document} />
      </div>
    </Dialog>
  );
}

function ViewerBody({ jobId, document }: { jobId: string; document: JobDocument }) {
  const file = useDocumentFile(jobId, viewKind(document.mime_type) ? document : undefined);
  return (
    <FileViewerBody name={document.original_filename} mimeType={document.mime_type} file={file} />
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
    return <Notice tone="error">{describeError(file.error, t, DRIVE_UNSUPPORTED)}</Notice>;
  }
  if (!url) return <p className="prose">{t("loading")}</p>;
  return <FileContent kind={kind} url={url} name={name} />;
}

interface FileContentProps {
  kind: "pdf" | "image" | "text";
  url: string;
  name: string;
}

function FileContent({ kind, url, name }: FileContentProps) {
  if (kind === "pdf")
    return <A4Preview title={name} pdfUrl={url} downloadName={name} slug={null} />;
  if (kind === "text") {
    return <object className="file-text" type="text/plain" data={url} aria-label={name} />;
  }
  return <img className="file-image" src={url} alt={name} />;
}
