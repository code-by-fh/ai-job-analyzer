"use client";

import { useQuery } from "@tanstack/react-query";
import { FileUp } from "lucide-react";
import type { ChangeEvent } from "react";
import type { Profile } from "@/api/profile";
import { setupStatusQueryOptions } from "@/api/setup";
import { AiSetupAction } from "@/features/inbox/onboarding/AiSetupAction";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { Dialog } from "@/ui/Dialog";
import { closeThenFocus } from "@/ui/focus";
import { Notice } from "@/ui/Notice";
import { PanelHeader } from "@/ui/PanelHeader";
import { RunningNotice } from "@/ui/RunningNotice";
import { useCvImport, useCvImportPhase, useCvImportStart, useCvPicker } from "./useCvImport";

const INPUT_ID = "pf-cv-import-file";
const BUTTON_ID = "pf-cv-import";
// Any declared type: the server checks the %PDF- signature (a capital .PDF from any OS works).
const PDF_ACCEPT = "application/pdf,.pdf";

/**
 * After the dialog: closeThenFocus commits the close first, so ModalLayer's cleanup gives focus
 * back to whatever held it when the dialog opened (after a file chooser, possibly nothing), and
 * the import button takes it one frame later.
 */
const thenRefocus = (action: () => void) => () =>
  closeThenFocus(action, () => document.getElementById(BUTTON_ID));

interface CvImportProps {
  profile: Profile;
  /** D6: an import never starts over unsaved edits of the Lebenslauf form. */
  dirty: boolean;
}

/** D6: "Lebenslauf importieren (PDF)", or the way to an AI provider when none is set up. */
export function CvImport(props: CvImportProps) {
  const { t } = useI18n();
  const setup = useQuery(setupStatusQueryOptions());
  if (setup.data && !setup.data.ai_configured) {
    return (
      <p className="meta cv-import">
        {t("profile.cv.import.noAi")} <AiSetupAction className="link" />
      </p>
    );
  }
  return <ImportControl {...props} />;
}

function ImportControl({ profile, dirty }: CvImportProps) {
  const { t } = useI18n();
  const run = useCvImport();
  const phase = useCvImportPhase(profile);
  const busy = phase === "running";
  const picker = useCvPicker({ profile, start: (file) => run.mutate(file) });
  // Constraint "long background states are static text plus aria-busy" (preflight ruling 27).
  return (
    <div className="cv-import" aria-busy={busy || undefined}>
      <ImportButton busy={busy} dirty={dirty} />
      <FileInput onChange={picker.pick} />
      {busy ? <ImportRunning profile={profile} /> : null}
      {phase === "failed" ? <Notice tone="error">{t("profile.cv.import.failed")}</Notice> : null}
      <ConfirmImport
        open={picker.pending !== null}
        onCancel={thenRefocus(picker.cancel)}
        onConfirm={thenRefocus(picker.confirm)}
      />
    </div>
  );
}

function ImportRunning({ profile }: { profile: Profile }) {
  const { t } = useI18n();
  return (
    <RunningNotice text={t("profile.cv.import.reading")} startedAt={useCvImportStart(profile)} />
  );
}

/** Out of the tab order and hidden from assistive tech: the button is the one way to it. */
function FileInput({ onChange }: { onChange: (event: ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <input
      id={INPUT_ID}
      type="file"
      className="sr-only"
      tabIndex={-1}
      aria-hidden="true"
      accept={PDF_ACCEPT}
      onChange={onChange}
    />
  );
}

/** Opens the hidden file input; inactive (still focusable) while busy or while the form is dirty. */
function ImportButton({ busy, dirty }: { busy: boolean; dirty: boolean }) {
  const { t } = useI18n();
  return (
    <Button
      id={BUTTON_ID}
      icon={FileUp}
      busy={busy}
      inactive={dirty}
      title={dirty ? t("profile.cv.import.dirty") : undefined}
      onClick={() => document.getElementById(INPUT_ID)?.click()}
    >
      {t("profile.cv.import.action")}
    </Button>
  );
}

interface ConfirmImportProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Ruling R1: says what the import replaces before anything is sent. */
function ConfirmImport({ open, onCancel, onConfirm }: ConfirmImportProps) {
  const { t } = useI18n();
  return (
    <Dialog open={open} onClose={onCancel} label={t("profile.cv.import.confirmTitle")}>
      <div className="panel-in profile-dialog">
        <PanelHeader title={t("profile.cv.import.confirmTitle")} onClose={onCancel} />
        <p className="prose">{t("profile.cv.import.confirmText")}</p>
        <div className="row panel-actions">
          <Button variant="primary" onClick={onConfirm}>
            {t("profile.cv.import.confirm")}
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            {t("guard.cancel")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
