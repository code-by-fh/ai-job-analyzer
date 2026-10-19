"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "./Button";
import { Dialog } from "./Dialog";

export interface ViewerDialogProps {
  /** Heading and accessible name of the dialog, e.g. "Lebenslauf" or a file name. */
  title: string;
  /** Muted line beside the title: the document's kind or context. */
  subtitle?: string;
  /** Toolbar buttons before the close button (edit, save, discard, download). */
  actions?: ReactNode;
  /** A strip between the toolbar and the page, e.g. a warning. */
  notice?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}

/**
 * The one large, frameless document modal (CV and letter, uploaded files, Profil › Nachweise):
 * a slim toolbar over the desk, the document centred on it. Escape, the scrim and the close
 * button all call `onClose`, so a caller with unsaved edits can ask first.
 */
export function ViewerDialog({ notice, children, ...bar }: ViewerDialogProps) {
  return (
    <Dialog open onClose={bar.onClose} label={bar.title} className="viewer">
      <ViewerBar {...bar} />
      {notice ? <div className="viewer-notice">{notice}</div> : null}
      <div className="viewer-body">{children}</div>
    </Dialog>
  );
}

type ViewerBarProps = Omit<ViewerDialogProps, "notice" | "children">;

function ViewerBar({ title, subtitle, actions, onClose }: ViewerBarProps) {
  const { t } = useI18n();
  return (
    <div className="viewer-bar">
      <ViewerHeading title={title} subtitle={subtitle} />
      <div className="viewer-actions">
        {actions}
        <Button
          variant="ghost"
          iconOnly
          icon={X}
          aria-label={t("dialog.close")}
          onClick={onClose}
        />
      </div>
    </div>
  );
}

function ViewerHeading({ title, subtitle }: Pick<ViewerBarProps, "title" | "subtitle">) {
  return (
    <div className="viewer-heading">
      <h2 className="viewer-title">{title}</h2>
      {subtitle ? <p className="viewer-subtitle">{subtitle}</p> : null}
    </div>
  );
}
