"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { createUser } from "@/api/admin";
import { describeError } from "@/api/describeError";
import { ApiError } from "@/api/errors";
import { fieldErrorsFrom } from "@/api/fieldErrors";
import { queryKeys } from "@/api/queryKeys";
import {
  passwordProblem,
  usernameProblem,
  type PasswordProblem,
  type UsernameProblem,
} from "@/domain/settings";
import { HTTP_CONFLICT, refusalText } from "@/features/profile/refusals";
import { useReportDirty } from "@/features/profile/useReportDirty";
import { DrawerSection } from "@/features/sources/drawer/DrawerSection";
import type { ReportDirty } from "@/features/sources/drawer/useDirtySections";
import { useSectionForm, type SectionForm } from "@/features/sources/drawer/useSectionForm";
import type { MessageKey } from "@/i18n/de";
import type { Translate } from "@/i18n/translate";
import { useI18n } from "@/i18n/useI18n";
import { TextField } from "@/ui/Field";
import { useToast } from "@/ui/ToastProvider";
import { USER_REFUSALS } from "./userRefusals";

type UserField = "username" | "password";
type UserDraft = Record<UserField, string>;
/** Translated, fixed texts only: a client check, a 422 or a known 409 code (never server words). */
type UserErrors = Partial<Record<UserField, string>>;

const EMPTY: UserDraft = { username: "", password: "" };
const USERNAME_HINT: MessageKey = "settings.users.usernameHint";
const PASSWORD_HINT: MessageKey = "settings.account.nextHint";
const USERNAME_ERROR: Readonly<Record<UsernameProblem, MessageKey>> = {
  tooShort: USERNAME_HINT,
  tooLong: "settings.problem.tooLong",
  chars: "settings.users.usernameChars",
};
// Ruling 23: the repeat is the password itself, so passwordProblem never answers "mismatch".
const PASSWORD_ERROR: Readonly<Record<Exclude<PasswordProblem, "mismatch">, MessageKey>> = {
  tooShort: PASSWORD_HINT,
  tooLong: "settings.account.tooLong",
};
const FIELD_ERROR: Readonly<Record<UserField, MessageKey>> = {
  username: USERNAME_HINT,
  password: PASSWORD_HINT,
};

const asUserField = (serverField: string): UserField | null =>
  serverField === "username" || serverField === "password" ? serverField : null;

/** The client checks of routers/auth.py UserCreate and NewPassword, as fixed message keys. */
function draftErrors(draft: UserDraft): Partial<Record<UserField, MessageKey>> {
  const name = usernameProblem(draft.username);
  const password = passwordProblem({ next: draft.password, repeat: draft.password });
  return {
    ...(name ? { username: USERNAME_ERROR[name] } : {}),
    ...(password && password !== "mismatch" ? { password: PASSWORD_ERROR[password] } : {}),
  };
}

/** A 409 belongs to the name (taken); a 422 names its field. Null: not a field's error. */
function refusalErrors(error: unknown, t: Translate): UserErrors | null {
  if (error instanceof ApiError && error.status === HTTP_CONFLICT)
    return { username: refusalText(error, t, USER_REFUSALS) };
  const fields = fieldErrorsFrom(error, asUserField);
  if (fields.length === 0) return null;
  return Object.fromEntries(fields.map((field) => [field, t(FIELD_ERROR[field])]));
}

/**
 * gcTime 0 and the reset once settled: the password sits in the mutation's variables, which must
 * not outlive the request (ruling 23). Success commits the empty draft, so nothing typed stays.
 */
function useCreateUser(form: SectionForm<UserDraft>, setErrors: (errors: UserErrors) => void) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  return useMutation({
    gcTime: 0,
    mutationFn: createUser,
    onSuccess: () => {
      form.commit(EMPTY);
      void queryClient.invalidateQueries({ queryKey: queryKeys.users });
      toast.show({ tone: "success", message: t("settings.users.created") });
    },
    onError: (error) => {
      const refused = refusalErrors(error, t);
      setErrors(refused ?? {});
      if (!refused) toast.show({ tone: "error", message: describeError(error, t) });
    },
  });
}

function useCreateUserForm(report: ReportDirty) {
  const { t } = useI18n();
  const form = useSectionForm<UserDraft>(EMPTY);
  const [errors, setErrors] = useState<UserErrors>({});
  const create = useCreateUser(form, setErrors);
  useReportDirty(report, "create-user", form.dirty);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = draftErrors(form.draft);
    setErrors(Object.fromEntries(Object.entries(found).map(([field, key]) => [field, t(key)])));
    if (Object.keys(found).length > 0 || create.isPending) return;
    const user = { username: form.draft.username.trim(), password: form.draft.password };
    create.mutate(user, { onSettled: () => create.reset() });
  };
  return { form, errors, submit, busy: create.isPending };
}

type CreateUserState = ReturnType<typeof useCreateUserForm>;

type FieldProps = Pick<CreateUserState, "form" | "errors">;

/** The hint gives way to an error on the same field. */
function UsernameField({ form, errors }: FieldProps) {
  const { t } = useI18n();
  return (
    <TextField
      id="settings-user-username"
      autoComplete="off"
      spellCheck={false}
      label={t("login.username")}
      hint={errors.username ? undefined : t(USERNAME_HINT)}
      value={form.draft.username}
      onChange={(event) => form.set({ username: event.target.value })}
      error={errors.username}
    />
  );
}

/** The rule gives way to an error; the advice to share the password safely always stays. */
function PasswordField({ form, errors }: FieldProps) {
  const { t } = useI18n();
  const share = t("settings.users.shareHint");
  return (
    <TextField
      id="settings-user-password"
      type="password"
      autoComplete="new-password"
      label={t("login.password")}
      hint={errors.password ? share : `${t(PASSWORD_HINT)} ${share}`}
      value={form.draft.password}
      onChange={(event) => form.set({ password: event.target.value })}
      error={errors.password}
    />
  );
}

/** D5: creates a member (the server cannot create admins); its own form with its own Speichern. */
export function CreateUserForm({ report }: { report: ReportDirty }) {
  const { t } = useI18n();
  const { form, errors, submit, busy } = useCreateUserForm(report);
  return (
    <DrawerSection
      id="settings-user-create"
      title={t("settings.users.create")}
      onSubmit={submit}
      busy={busy}
      dirty={form.dirty}
    >
      <UsernameField form={form} errors={errors} />
      <PasswordField form={form} errors={errors} />
    </DrawerSection>
  );
}
