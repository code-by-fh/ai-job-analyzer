"use client";

import type { FormEvent, KeyboardEvent, ReactNode } from "react";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { Dialog } from "@/ui/Dialog";
import { PanelHeader } from "@/ui/PanelHeader";

export interface ConfirmDialogProps {
  title: string;
  confirmLabel: string;
  /** Crimson only for destructive actions (spec 5); a restorable one is primary. */
  tone?: "danger" | "primary";
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
  /** The question's text, and fields the confirmation needs (e.g. a password). */
  children: ReactNode;
}

// These handle Enter themselves: a button activates, a field submits implicitly, a textarea breaks.
const OWN_ENTER = "button, a[href], input, select, textarea";

/**
 * Review M3: a click on the dialog text focuses the form (tabIndex -1), where the browser has no
 * implicit submission; Enter there confirms as it does in a field.
 */
function confirmOnEnter(event: KeyboardEvent<HTMLFormElement>): void {
  if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
  if (event.target instanceof Element && event.target.closest(OWN_ENTER)) return;
  event.preventDefault();
  event.currentTarget.requestSubmit();
}

/** A busy confirmation is already on its way; a second submit (Enter again) is ignored. */
function submitUnlessBusy(busy: boolean, onConfirm: () => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!busy) onConfirm();
  };
}

type ConfirmActionsProps = Pick<ConfirmDialogProps, "confirmLabel" | "tone" | "busy" | "onClose">;

function ConfirmActions({ confirmLabel, tone, busy, onClose }: ConfirmActionsProps) {
  const { t } = useI18n();
  return (
    <div className="row panel-actions">
      <Button type="submit" variant={tone} busy={busy}>
        {confirmLabel}
      </Button>
      <Button variant="ghost" onClick={onClose}>
        {t("guard.cancel")}
      </Button>
    </div>
  );
}

/**
 * Preflight ruling 19: the one confirmation of Einstellungen (and 7b). It is a form whose submit
 * is the confirm button, so Enter in a field confirms; a busy confirm button blocks the submit.
 * The panel carries settings-dialog because the dialog portals outside .settings (ruling 17).
 * Review M5: the first focus is the close X (ModalLayer's first focusable) unless a child carries
 * `data-autofocus`; a confirmation with a field (the T9 password) must set it on that field.
 */
export function ConfirmDialog(props: ConfirmDialogProps) {
  const { title, confirmLabel, tone = "danger", busy, onConfirm, onClose, children } = props;
  const submit = submitUnlessBusy(busy, onConfirm);
  return (
    <Dialog open onClose={onClose} label={title}>
      <form
        className="panel-in settings-dialog"
        tabIndex={-1}
        onSubmit={submit}
        onKeyDown={confirmOnEnter}
        noValidate
      >
        <PanelHeader title={title} onClose={onClose} />
        {children}
        <ConfirmActions confirmLabel={confirmLabel} tone={tone} busy={busy} onClose={onClose} />
      </form>
    </Dialog>
  );
}
