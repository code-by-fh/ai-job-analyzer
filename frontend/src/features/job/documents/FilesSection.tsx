"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Eye, Trash2, Upload, type LucideIcon } from "lucide-react";
import { useState, type ChangeEvent } from "react";
import { describeError, type ErrorMessageOverrides } from "@/api/describeError";
import {
  deleteJobDocument,
  downloadJobDocument,
  jobDocumentsQueryOptions,
  uploadJobDocument,
  type JobDocument,
} from "@/api/jobDocuments";
import type { JobDetail } from "@/api/jobs";
import { queryKeys } from "@/api/queryKeys";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { Dialog } from "@/ui/Dialog";
import { Icon } from "@/ui/Icon";
import { Notice } from "@/ui/Notice";
import { PanelHeader } from "@/ui/PanelHeader";
import { useToast } from "@/ui/ToastProvider";
import { useJobFormat } from "../format/useJobFormat";
import { FileViewer } from "./FileViewer";
import { saveFile } from "./saveFile";
import {
  fileKindLabel,
  formatFileSize,
  UPLOAD_ACCEPT,
  uploadProblem,
  viewKind,
} from "./uploadRules";

const UPLOAD_INPUT_ID = "job-file-upload";
const UPLOAD_HINT_ID = "job-file-upload-hint";
const UPLOAD_ERRORS: ErrorMessageOverrides = {
  PAYLOAD_TOO_LARGE: "files.serverTooLarge",
  UNSUPPORTED_MEDIA_TYPE: "files.serverUnsupportedType",
};

/** Files of one job: upload, list, view, download, delete after confirming. */
export function FilesSection({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  return (
    <section className="files" aria-labelledby="files-title">
      <h3 className="sec-title-sm" id="files-title">
        {t("files.title")}
      </h3>
      <p className="meta">{t("files.intro")}</p>
      <UploadControl job={job} />
      <FileList job={job} />
    </section>
  );
}

function FileList({ job }: { job: JobDetail }) {
  const documents = useQuery(jobDocumentsQueryOptions(job.id)).data ?? [];
  const [viewing, setViewing] = useState<JobDocument | null>(null);
  const [deleting, setDeleting] = useState<JobDocument | null>(null);
  return (
    <>
      <FileRows job={job} documents={documents} onView={setViewing} onDelete={setDeleting} />
      <FileOverlays
        job={job}
        viewing={viewing}
        deleting={deleting}
        onClose={() => {
          setViewing(null);
          setDeleting(null);
        }}
      />
    </>
  );
}

interface FileRowsProps {
  job: JobDetail;
  documents: JobDocument[];
  onView: (document: JobDocument) => void;
  onDelete: (document: JobDocument) => void;
}

function FileRows({ job, documents, onView, onDelete }: FileRowsProps) {
  const { t } = useI18n();
  if (documents.length === 0) return <p className="meta">{t("files.empty")}</p>;
  return (
    <ul role="list" className="file-list">
      {documents.map((document) => (
        <FileRow
          key={document.id}
          job={job}
          document={document}
          onView={onView}
          onDelete={onDelete}
        />
      ))}
    </ul>
  );
}

interface FileOverlaysProps {
  job: JobDetail;
  viewing: JobDocument | null;
  deleting: JobDocument | null;
  onClose: () => void;
}

function FileOverlays({ job, viewing, deleting, onClose }: FileOverlaysProps) {
  if (viewing) return <FileViewer jobId={job.id} document={viewing} onClose={onClose} />;
  if (deleting) return <DeleteDialog job={job} document={deleting} onClose={onClose} />;
  return null;
}

function useInvalidateDocuments(jobId: string) {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: queryKeys.jobDocuments(jobId) });
}

function useUpload(jobId: string, onProblem: (message: string | null) => void) {
  const { t } = useI18n();
  const toast = useToast();
  const refresh = useInvalidateDocuments(jobId);
  return useMutation({
    mutationFn: (file: File) => uploadJobDocument(jobId, file),
    onSuccess: (_result, file) => {
      refresh();
      toast.show({ tone: "success", message: t("files.uploaded", { name: file.name }) });
    },
    onError: (error) => onProblem(describeError(error, t, UPLOAD_ERRORS)),
  });
}

function useFilePicker(jobId: string, onProblem: (message: string | null) => void) {
  const { t } = useI18n();
  const upload = useUpload(jobId, onProblem);
  return (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const found = uploadProblem(file);
    onProblem(found ? t(`files.${found}`, { name: file.name }) : null);
    if (!found) upload.mutate(file);
  };
}

function UploadControl({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  const [problem, setProblem] = useState<string | null>(null);
  const onChange = useFilePicker(job.id, setProblem);
  return (
    <div className="upload">
      <label className="btn btn-sm" htmlFor={UPLOAD_INPUT_ID}>
        <Icon icon={Upload} />
        <span>{t("files.upload")}</span>
      </label>
      <UploadInput onChange={onChange} />
      <p className="meta" id={UPLOAD_HINT_ID}>
        {t("files.uploadHint")}
      </p>
      <UploadProblem problem={problem} />
    </div>
  );
}

/** Mounted before any problem exists, so a newly shown problem is announced. */
function UploadProblem({ problem }: { problem: string | null }) {
  return (
    <div role="alert">
      {problem ? (
        <Notice tone="error" announce={false}>
          {problem}
        </Notice>
      ) : null}
    </div>
  );
}

function UploadInput({ onChange }: { onChange: (event: ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <input
      id={UPLOAD_INPUT_ID}
      className="sr-only"
      type="file"
      accept={UPLOAD_ACCEPT}
      aria-describedby={UPLOAD_HINT_ID}
      onChange={onChange}
    />
  );
}

interface FileRowProps {
  job: JobDetail;
  document: JobDocument;
  onView: (document: JobDocument) => void;
  onDelete: (document: JobDocument) => void;
}

function FileRow({ job, document, onView, onDelete }: FileRowProps) {
  const meta = useFileMeta(document);
  return (
    <li className="file-row">
      <div>
        <div className="file-name">{document.original_filename}</div>
        <div className="meta">{meta}</div>
      </div>
      <div className="row">
        <FileActions job={job} document={document} onView={onView} onDelete={onDelete} />
      </div>
    </li>
  );
}

function FileActions({ job, document, onView, onDelete }: FileRowProps) {
  const { t } = useI18n();
  const name = document.original_filename;
  return (
    <>
      {viewKind(document.mime_type) ? (
        <RowButton icon={Eye} label={t("files.view", { name })} onClick={() => onView(document)} />
      ) : null}
      <FileDownload job={job} document={document} />
      <RowButton
        icon={Trash2}
        label={t("files.delete", { name })}
        onClick={() => onDelete(document)}
      />
    </>
  );
}

function RowButton(props: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <Button
      size="sm"
      variant="ghost"
      iconOnly
      icon={props.icon}
      aria-label={props.label}
      onClick={props.onClick}
    />
  );
}

function useFileMeta(document: JobDocument): string {
  const { t, language } = useI18n();
  const format = useJobFormat();
  return [
    t(fileKindLabel(document.kind)),
    document.file_size ? formatFileSize(document.file_size, language) : null,
    document.uploaded_at ? format.date(document.uploaded_at) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function useDownload(jobId: string, document: JobDocument) {
  const { t } = useI18n();
  const toast = useToast();
  return useMutation({
    mutationFn: () => downloadJobDocument(jobId, document.id),
    onSuccess: (file) => saveFile(file, document.original_filename),
    onError: (error) => toast.show({ tone: "error", message: describeError(error, t) }),
  });
}

function FileDownload({ job, document }: { job: JobDetail; document: JobDocument }) {
  const { t } = useI18n();
  const download = useDownload(job.id, document);
  return (
    <Button
      size="sm"
      variant="ghost"
      iconOnly
      icon={Download}
      busy={download.isPending}
      aria-label={t("files.download", { name: document.original_filename })}
      onClick={() => download.mutate()}
    />
  );
}

function useDeleteFile(jobId: string, document: JobDocument, onDone: () => void) {
  const { t } = useI18n();
  const toast = useToast();
  const refresh = useInvalidateDocuments(jobId);
  return useMutation({
    mutationFn: () => deleteJobDocument(jobId, document.id),
    onSuccess: () => {
      refresh();
      toast.show({ message: t("files.deleted", { name: document.original_filename }) });
      onDone();
    },
    onError: (error) => toast.show({ tone: "error", message: describeError(error, t) }),
  });
}

interface DeleteDialogProps {
  job: JobDetail;
  document: JobDocument;
  onClose: () => void;
}

function DeleteDialog({ job, document, onClose }: DeleteDialogProps) {
  const { t } = useI18n();
  const remove = useDeleteFile(job.id, document, onClose);
  return (
    <Dialog open onClose={onClose} label={t("files.deleteTitle")}>
      <div className="panel-in">
        <PanelHeader title={t("files.deleteTitle")} onClose={onClose} />
        <p className="prose">{t("files.deleteText", { name: document.original_filename })}</p>
        <div className="row panel-actions">
          <Button variant="danger" busy={remove.isPending} onClick={() => remove.mutate()}>
            {t("files.deleteConfirm")}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {t("guard.cancel")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
