"use client";

import { CircleAlert } from "lucide-react";
import type { Platform } from "@/api/platforms";
import { isFailedRun, lastRunOf, RUN_ERROR_LABEL, type RunSummary } from "@/domain/runLine";
import { formatDayTime } from "@/i18n/formatDayTime";
import type { Translate } from "@/i18n/translate";
import { useI18n } from "@/i18n/useI18n";
import { useNow } from "@/lib/clock";
import { Icon } from "@/ui/Icon";

/** The result part of a run (also used by the drawer history, Task 11). */
export function runResult(run: RunSummary, t: Translate): string {
  if (run.error === "cancelled") return t(RUN_ERROR_LABEL.cancelled);
  if (run.error) return t("sources.run.failed", { reason: t(RUN_ERROR_LABEL[run.error]) });
  if (run.seeded) return t("sources.run.seeded", { found: run.found });
  return t("runline.counts", { found: run.found, matched: run.matched, below: run.below });
}

/** D14: when it ran and what it found; a failure in crimson with icon and words. */
export function RunCell({ platform }: { platform: Platform }) {
  const { t, language } = useI18n();
  const now = useNow();
  const run = lastRunOf(platform);
  if (!run) return <span className="muted">{t("sources.run.never")}</span>;
  const when = formatDayTime(run.finishedAt, t, { now, language });
  const text = t("sources.run.item", { when, result: runResult(run, t) });
  if (!isFailedRun(run.error)) return <span>{text}</span>;
  return (
    <span className="t-danger src-run-error">
      <Icon icon={CircleAlert} />
      <span>{text}</span>
    </span>
  );
}
