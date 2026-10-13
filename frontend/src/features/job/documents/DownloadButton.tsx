"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { describeError } from "@/api/describeError";
import {
  downloadJobDocument,
  generatedDocument,
  jobDocumentsQueryOptions,
  type DocumentKind,
  type JobDocument,
} from "@/api/jobDocuments";
import type { JobDetail } from "@/api/jobs";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { useToast } from "@/ui/ToastProvider";
import { DRIVE_UNSUPPORTED, saveFile } from "./saveFile";

function useDownload(jobId: string) {
  const { t } = useI18n();
  const toast = useToast();
  return useMutation({
    mutationFn: (target: JobDocument) => downloadJobDocument(jobId, target.id),
    onSuccess: (file, target) => saveFile(file, target.original_filename),
    onError: (error) =>
      toast.show({ tone: "error", message: describeError(error, t, DRIVE_UNSUPPORTED) }),
  });
}

export function DownloadButton({ job, kind }: { job: JobDetail; kind: DocumentKind }) {
  const { t } = useI18n();
  const document = generatedDocument(useQuery(jobDocumentsQueryOptions(job.id)).data ?? [], kind);
  const download = useDownload(job.id);
  if (!document) return null;
  return (
    <Button
      size="sm"
      icon={Download}
      busy={download.isPending}
      onClick={() => download.mutate(document)}
    >
      {t("preview.downloadPdf")}
    </Button>
  );
}
