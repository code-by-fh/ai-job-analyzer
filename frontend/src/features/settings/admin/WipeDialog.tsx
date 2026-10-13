"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { wipeDatabase } from "@/api/admin";
import { ADMIN_REFUSAL } from "@/api/adminPaths";
import { describeError, type ErrorMessageOverrides } from "@/api/describeError";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { TextField } from "@/ui/Field";
import { focusNextFrame } from "@/ui/focus";
import { Notice } from "@/ui/Notice";
import { useLeaveForInbox } from "../useLeaveForInbox";
import { isWrongPassword } from "../wrongPassword";
import { ConfirmDialog } from "../ConfirmDialog";

const PASSWORD_ID = "settings-wipe-password";

/**
 * The wipe answers 409 only while a source owner's crawl runs (routers/admin.py). Unlike the user
 * delete (T7), which closes on its 409 because its row and button stay put, this dialog stays open
 * as the factory reset does (ruling 49): the refusal names no fault of the password, so the admin
 * can retry once the search has finished, and the 429 and every other error stay here too.
 */
const OVERRIDES: ErrorMessageOverrides = { CONFLICT: "settings.account.crawlRunning" };

/**
 * Success leaves for the inbox with a full navigation: the admin's own jobs and sources are gone
 * with either scope, so the inbox shows the onboarding. A wrong password puts focus back into the
 * field for the next try; every error keeps the dialog open.
 */
function useWipe() {
  const leave = useLeaveForInbox();
  return useMutation({
    // The password sits in the mutation's variables: they go with the dialog, not 5 minutes later.
    gcTime: 0,
    mutationFn: wipeDatabase,
    onSuccess: leave,
    onError: (error) => {
      if (isWrongPassword(error, ADMIN_REFUSAL.wrongPassword))
        focusNextFrame(() => document.getElementById(PASSWORD_ID));
    },
  });
}

function fieldProblem(missing: boolean, wrong: boolean): MessageKey | null {
  if (missing) return "settings.problem.required";
  return wrong ? "settings.system.wrongPassword" : null;
}

/** The field error (a missing or refused password) and any other failure, shown in the dialog. */
function wipeFeedback(error: unknown, missing: boolean) {
  // routers/admin.py wipe_database: a wrong password is 400 (never 401, which would end the session).
  const wrong = isWrongPassword(error, ADMIN_REFUSAL.wrongPassword);
  return { fieldError: fieldProblem(missing, wrong), failure: error && !wrong ? error : null };
}

/** An empty password is refused here; each server check costs one of the five tries a minute. */
function useWipeDialog(allUsers: boolean) {
  const [password, setPassword] = useState("");
  const [missing, setMissing] = useState(false);
  const wipe = useWipe();
  const confirm = () => {
    setMissing(!password);
    if (password) wipe.mutate({ password, allUsers });
  };
  // Review M3: a refusal is about the password that was sent; typing a new one clears it.
  const type = (value: string) => {
    setPassword(value);
    setMissing(false);
    if (wipe.isError) wipe.reset();
  };
  // After success the page is unloading: the dialog stays busy, so a second Enter sends nothing.
  const busy = wipe.isPending || wipe.isSuccess;
  return { password, type, confirm, busy, ...wipeFeedback(wipe.error, missing) };
}

type WipeDialogState = ReturnType<typeof useWipeDialog>;

function WipePasswordField({ state }: { state: WipeDialogState }) {
  const { t } = useI18n();
  return (
    <TextField
      id={PASSWORD_ID}
      type="password"
      autoComplete="current-password"
      label={t("settings.account.factoryResetPassword")}
      value={state.password}
      onChange={(event) => state.type(event.target.value)}
      error={state.fieldError ? t(state.fieldError) : undefined}
      data-autofocus
    />
  );
}

/** Any refusal but the password's, as a fixed sentence. */
function WipeFailure({ failure }: { failure: unknown }) {
  const { t } = useI18n();
  if (!failure) return null;
  return <Notice tone="error">{describeError(failure, t, OVERRIDES)}</Notice>;
}

interface WipeDialogProps {
  allUsers: boolean;
  onClose: () => void;
}

/**
 * Preflight ruling 24: the question names what the chosen scope deletes (routers/admin.py
 * wipe_database). The password lives only here: closing the dialog unmounts it and drops it.
 */
export function WipeDialog({ allUsers, onClose }: WipeDialogProps) {
  const { t } = useI18n();
  const state = useWipeDialog(allUsers);
  const scopeText = allUsers ? "settings.system.wipeAllText" : "settings.system.wipeOwnText";
  // R12: wiping everyone's data says so on the button too.
  const confirmLabel = allUsers ? "settings.system.wipeAllConfirm" : "settings.system.wipe";
  return (
    <ConfirmDialog
      title={t("settings.system.wipe")}
      confirmLabel={t(confirmLabel)}
      tone="danger"
      busy={state.busy}
      onConfirm={state.confirm}
      onClose={onClose}
    >
      <p className="prose">{`${t(scopeText)} ${t("settings.system.wipeText")}`}</p>
      <WipePasswordField state={state} />
      <WipeFailure failure={state.failure} />
    </ConfirmDialog>
  );
}
