"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { jobDocumentsQueryOptions, type DocumentKind } from "@/api/jobDocuments";
import type { JobDetail } from "@/api/jobs";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { useToast } from "@/ui/ToastProvider";
import { DOCUMENT_LABEL } from "../labels";
import { describePdfError, hasPdf, savePdf, type PdfTarget } from "./downloadPdf";

function useDownload() {
  const { t } = useI18n();
  const toast = useToast();
  return useMutation({
    mutationFn: (target: PdfTarget) => savePdf(target),
    onError: (error) => toast.show({ tone: "error", message: describePdfError(error, t) }),
  });
}

export function DownloadButton({ job, kind }: { job: JobDetail; kind: DocumentKind }) {
  const { t } = useI18n();
  const documents = useQuery(jobDocumentsQueryOptions(job.id)).data ?? [];
  const download = useDownload();
  const target: PdfTarget = { job, kind, documents, label: t(DOCUMENT_LABEL[kind]) };
  if (!hasPdf(target)) return null;
  return (
    <Button
      size="sm"
      icon={Download}
      busy={download.isPending}
      onClick={() => download.mutate(target)}
    >
      {t("preview.downloadPdf")}
    </Button>
  );
}
