"use client";

import { useMutation } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import { useState } from "react";
import { factoryReset } from "@/api/account";
import { describeError } from "@/api/describeError";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { TextField } from "@/ui/Field";
import { Icon } from "@/ui/Icon";
import { useToast } from "@/ui/ToastProvider";
import { ConfirmDialog } from "../ConfirmDialog";
import { useConfirmation } from "../useConfirmation";
import { useLeaveForInbox } from "../useLeaveForInbox";
import { isWrongPassword } from "../wrongPassword";

const HEADING_ID = "settings-danger-h";
const OPENER_ID = "settings-factory-reset-open";
const PASSWORD_ID = "settings-factory-reset-password";

/**
 * Preflight ruling 49: a wrong password is a field error, 409 (a search runs) and 429 are fixed
 * toasts; the dialog stays open on every error. Success navigates fully to the inbox, which shows
 * the onboarding of the now empty account (as the logout ADR).
 */
function useFactoryReset(setError: (key: MessageKey | null) => void) {
  const toast = useToast();
  const { t } = useI18n();
  const leave = useLeaveForInbox();
  return useMutation({
    // The password sits in the mutation's variables: they go with the dialog, not 5 minutes later.
    gcTime: 0,
    mutationFn: factoryReset,
    onSuccess: leave,
    onError: (error) => {
      const wrong = isWrongPassword(error);
      setError(wrong ? "settings.account.wrongCurrent" : null);
      if (!wrong) {
        const message = describeError(error, t, { CONFLICT: "settings.account.crawlRunning" });
        toast.show({ tone: "error", message });
      }
    },
  });
}

/** An empty password is refused here; the server's check costs one of the five tries a minute. */
function useResetDialog() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<MessageKey | null>(null);
  const reset = useFactoryReset(setError);
  const confirm = () => {
    if (!password) setError("settings.problem.required");
    else reset.mutate(password);
  };
  // After success the page is unloading: the dialog stays busy, so a second Enter sends nothing.
  return { password, setPassword, error, confirm, busy: reset.isPending || reset.isSuccess };
}

type ResetDialogState = ReturnType<typeof useResetDialog>;

function ConfirmPasswordField({ state }: { state: ResetDialogState }) {
  const { t } = useI18n();
  return (
    <TextField
      id={PASSWORD_ID}
      type="password"
      autoComplete="current-password"
      label={t("settings.account.factoryResetPassword")}
      value={state.password}
      onChange={(event) => state.setPassword(event.target.value)}
      error={state.error ? t(state.error) : undefined}
      data-autofocus
    />
  );
}

/** The password lives only in this dialog: closing it unmounts the field and drops the value. */
function FactoryResetDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const state = useResetDialog();
  return (
    <ConfirmDialog
      title={t("settings.account.factoryReset")}
      confirmLabel={t("settings.account.factoryReset")}
      busy={state.busy}
      onConfirm={state.confirm}
      onClose={onClose}
    >
      <p className="prose">{t("settings.account.factoryResetText")}</p>
      <ConfirmPasswordField state={state} />
    </ConfirmDialog>
  );
}

/** Spec 5: the crimson zone, with an icon and words; everything the account owns goes. */
export function FactoryReset() {
  const { t } = useI18n();
  const confirmation = useConfirmation(OPENER_ID);
  return (
    <section className="settings-block account-block danger-zone" aria-labelledby={HEADING_ID}>
      <h3 id={HEADING_ID} className="sec-title-sm">
        <Icon icon={TriangleAlert} />
        <span>{t("settings.account.danger")}</span>
      </h3>
      <p className="prose">{t("settings.account.factoryResetText")}</p>
      <Button id={OPENER_ID} variant="danger" onClick={confirmation.ask}>
        {t("settings.account.factoryReset")}
      </Button>
      {confirmation.open ? <FactoryResetDialog onClose={confirmation.cancel} /> : null}
    </section>
  );
}
