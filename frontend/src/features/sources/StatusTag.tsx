"use client";

import { CircleAlert, LoaderCircle } from "lucide-react";
import type { SourceState } from "@/domain/sources";
import { useI18n } from "@/i18n/useI18n";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/Icon";
import { SOURCE_STATE_LABEL } from "./labels";

/**
 * A static tag (usability #15: hairline, no fill; preflight R-16: its own 13 px span, not the 12 px
 * Tag). The spinner is the one moving indicator of the page: a running crawl (spec 5).
 */
export function StatusTag({ state }: { state: SourceState }) {
  const { t } = useI18n();
  return (
    <span className={cx("src-status", `src-status-${state}`, state === "failing" && "t-danger")}>
      {state === "running" ? <Icon icon={LoaderCircle} className="spin" /> : null}
      {state === "failing" ? <Icon icon={CircleAlert} /> : null}
      <span>{t(SOURCE_STATE_LABEL[state])}</span>
    </span>
  );
}
