"use client";

import { SearchX } from "lucide-react";
import Link from "next/link";
import { DEFAULT_AFTER_LOGIN_PATH } from "@/api/session";
import { useI18n } from "@/i18n/useI18n";
import { EmptyState } from "@/ui/EmptyState";

export function NotFoundView() {
  const { t } = useI18n();
  const back = (
    <Link className="btn" href={DEFAULT_AFTER_LOGIN_PATH}>
      {t("notFound.back")}
    </Link>
  );
  return (
    <div className="page">
      <EmptyState icon={SearchX} title={t("notFound.title")} actions={back}>
        {t("notFound.text")}
      </EmptyState>
    </div>
  );
}
