"use client";

import { useI18n } from "@/i18n/useI18n";

/** Whole-page loading state: skeleton lines instead of a spinner (spec 6). */
export function PageSkeleton() {
  const { t } = useI18n();
  return (
    <div className="page" role="status" aria-busy="true">
      <span className="sr-only">{t("loading")}</span>
      <div className="mast" />
      <span className="skeleton-line w-2/3" />
      <span className="skeleton-line w-1/2" />
      <span className="skeleton-line w-3/4" />
    </div>
  );
}
