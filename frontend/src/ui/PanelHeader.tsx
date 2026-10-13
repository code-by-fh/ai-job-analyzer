"use client";

import { X } from "lucide-react";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "./Button";

export function PanelHeader({ title, onClose }: { title: string; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <div className="panel-head">
      <h2 className="panel-title">{title}</h2>
      <Button variant="ghost" iconOnly icon={X} aria-label={t("dialog.close")} onClick={onClose} />
    </div>
  );
}
