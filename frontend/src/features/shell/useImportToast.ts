"use client";

import { useRouter } from "next/navigation";
import { roundScore, scoreBand } from "@/domain/scoreBand";
import type { Translate } from "@/i18n/translate";
import { useI18n } from "@/i18n/useI18n";
import type { ImportResult } from "@/realtime/imports";
import { BAND_LABEL } from "@/ui/ScoreMeter";
import { useToast } from "@/ui/ToastProvider";
import { jobRoute } from "./routes";

export function importMessage(result: ImportResult, t: Translate): string {
  if (result.outcome === "failed") return t("import.failed");
  if (result.outcome === "exists") return t("import.exists");
  if (result.score === null) return t("import.doneUnscored");
  const score = roundScore(result.score);
  const band = t(BAND_LABEL[scoreBand(score)]);
  return t(result.archived ? "import.doneBelow" : "import.done", { score, band });
}

/** The toast for a finished import: what happened and, when there is a job, a way to it. */
export function useImportToast(): (result: ImportResult) => void {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  return (result) => {
    const { jobId } = result;
    const failed = result.outcome === "failed";
    const action =
      jobId && !failed
        ? { label: t("action.view"), onAction: () => router.push(jobRoute(jobId)) }
        : undefined;
    toast.show({ tone: failed ? "error" : "success", message: importMessage(result, t), action });
  };
}
