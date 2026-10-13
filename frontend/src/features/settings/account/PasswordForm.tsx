"use client";

import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { changePassword } from "@/api/account";
import { describeError } from "@/api/describeError";
import { fieldErrorsFrom } from "@/api/fieldErrors";
import { passwordProblem, type PasswordProblem } from "@/domain/settings";
import { useReportDirty } from "@/features/profile/useReportDirty";
import { DrawerSection } from "@/features/sources/drawer/DrawerSection";
import type { ReportDirty } from "@/features/sources/drawer/useDirtySections";
import { useSectionForm, type SectionForm } from "@/features/sources/drawer/useSectionForm";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { TextField } from "@/ui/Field";
import { useToast } from "@/ui/ToastProvider";
import { isWrongPassword } from "../wrongPassword";

type PasswordField = "current" | "next" | "repeat";
type PasswordDraft = Record<PasswordField, string>;
type PasswordErrors = Partial<Record<PasswordField, MessageKey>>;

const EMPTY: PasswordDraft = { current: "", next: "", repeat: "" };
const NEXT_HINT: MessageKey = "settings.account.nextHint";
// Preflight rulings 27 and 47: too short repeats the hint; too long is one fixed text (R9).
const PROBLEM_ERROR: Readonly<Record<PasswordProblem, [PasswordField, MessageKey]>> = {
  tooShort: ["next", NEXT_HINT],
  tooLong: ["next", "settings.account.tooLong"],
  mismatch: ["repeat", "settings.account.mismatch"],
};
const FIELDS: readonly {
  field: PasswordField;
  label: MessageKey;
  autoComplete: string;
  hint?: MessageKey;
}[] = [
  { field: "current", label: "settings.account.current", autoComplete: "current-password" },
  { field: "next", label: "settings.account.next", autoComplete: "new-password", hint: NEXT_HINT },
  { field: "repeat", label: "settings.account.repeat", autoComplete: "new-password" },
];

const toNextField = (serverField: string) => (serverField === "new_password" ? "next" : null);

/** The client checks of routers/auth.py's NewPassword, plus an empty current password. */
function draftErrors(draft: PasswordDraft): PasswordErrors {
  const errors: PasswordErrors = draft.current ? {} : { current: "settings.problem.required" };
  const problem = passwordProblem(draft);
  if (problem) {
    const [field, key] = PROBLEM_ERROR[problem];
    errors[field] = key;
  }
  return errors;
}

/** An allow-list by status, never the server's detail: 400 wrong current, 422 the new password. */
function refusalErrors(error: unknown): PasswordErrors | null {
  if (isWrongPassword(error)) return { current: "settings.account.wrongCurrent" };
  if (fieldErrorsFrom(error, toNextField).length > 0) return { next: NEXT_HINT };
  return null;
}

/**
 * Success empties the three fields (an empty draft is clean again) and toasts; 429 and the rest toast.
 * gcTime 0 and the reset once settled (as CreateUserForm): both passwords sit in the mutation's
 * variables, which must not outlive the request while the form stays mounted.
 */
function usePasswordChange(
  form: SectionForm<PasswordDraft>,
  setErrors: (errors: PasswordErrors) => void,
) {
  const toast = useToast();
  const { t } = useI18n();
  return useMutation({
    gcTime: 0,
    mutationFn: changePassword,
    onSuccess: () => {
      form.commit(EMPTY);
      toast.show({ tone: "success", message: t("settings.account.changed") });
    },
    onError: (error) => {
      const refused = refusalErrors(error);
      setErrors(refused ?? {});
      if (!refused) toast.show({ tone: "error", message: describeError(error, t) });
    },
  });
}

function usePasswordForm(report: ReportDirty) {
  const form = useSectionForm<PasswordDraft>(EMPTY);
  const [errors, setErrors] = useState<PasswordErrors>({});
  const change = usePasswordChange(form, setErrors);
  // A typed password is an unsaved edit: leaving the section asks first.
  useReportDirty(report, "password", form.dirty);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = draftErrors(form.draft);
    setErrors(found);
    if (Object.keys(found).length > 0 || change.isPending) return;
    change.mutate(
      { current: form.draft.current, next: form.draft.next },
      { onSettled: () => change.reset() },
    );
  };
  return { form, errors, submit, busy: change.isPending };
}

interface PasswordFieldsProps {
  form: SectionForm<PasswordDraft>;
  errors: PasswordErrors;
}

/** The hint gives way to an error on the same field (too short repeats the hint). */
function PasswordFields({ form, errors }: PasswordFieldsProps) {
  const { t } = useI18n();
  return FIELDS.map(({ field, label, autoComplete, hint }) => {
    const error = errors[field];
    return (
      <TextField
        key={field}
        id={`settings-password-${field}`}
        type="password"
        autoComplete={autoComplete}
        label={t(label)}
        hint={hint && !error ? t(hint) : undefined}
        value={form.draft[field]}
        onChange={(event) => form.set({ [field]: event.target.value })}
        error={error ? t(error) : undefined}
      />
    );
  });
}

/** Passwort ändern (D10): its own form with its own Speichern, validated on submit. */
export function PasswordForm({ report }: { report: ReportDirty }) {
  const { t } = useI18n();
  const { form, errors, submit, busy } = usePasswordForm(report);
  return (
    <DrawerSection
      id="settings-password"
      title={t("settings.account.password")}
      onSubmit={submit}
      busy={busy}
      dirty={form.dirty}
    >
      <PasswordFields form={form} errors={errors} />
    </DrawerSection>
  );
}
