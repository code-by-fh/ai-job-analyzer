"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { login } from "@/api/auth";
import { safeNextPath } from "@/api/session";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { TextField } from "@/ui/Field";
import { Notice } from "@/ui/Notice";
import {
  loginErrorMessage,
  readCredentials,
  validateCredentials,
  type CredentialField,
  type FieldErrors,
} from "./credentials";

interface LoginField {
  name: CredentialField;
  type: "text" | "password";
  labelKey: MessageKey;
  autoComplete: string;
}

const LOGIN_FIELDS: readonly LoginField[] = [
  { name: "username", type: "text", labelKey: "login.username", autoComplete: "username" },
  {
    name: "password",
    type: "password",
    labelKey: "login.password",
    autoComplete: "current-password",
  },
];

export function LoginForm() {
  const { t } = useI18n();
  const { fieldErrors, onSubmit, mutation } = useLoginForm();
  return (
    <form className="auth-form" onSubmit={onSubmit} noValidate>
      <CredentialFields errors={fieldErrors} />
      {mutation.isError ? (
        <Notice tone="error">{loginErrorMessage(mutation.error, t)}</Notice>
      ) : null}
      <Button type="submit" variant="primary" busy={mutation.isPending} className="auth-submit">
        {t("login.submit")}
      </Button>
    </form>
  );
}

function CredentialFields({ errors }: { errors: FieldErrors }) {
  const { t } = useI18n();
  return LOGIN_FIELDS.map((field) => {
    const errorKey = errors[field.name];
    return (
      <TextField
        key={field.name}
        id={`login-${field.name}`}
        name={field.name}
        type={field.type}
        label={t(field.labelKey)}
        autoComplete={field.autoComplete}
        error={errorKey && t(errorKey)}
      />
    );
  });
}

function focusFirstInvalid(form: HTMLFormElement, errors: FieldErrors): void {
  const first = LOGIN_FIELDS.find((field) => errors[field.name]);
  const control = first && form.elements.namedItem(first.name);
  if (control instanceof HTMLElement) control.focus();
}

function useLoginForm() {
  const router = useRouter();
  const next = safeNextPath(useSearchParams().get("next"));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const mutation = useMutation({ mutationFn: login, onSuccess: () => router.replace(next) });
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // A second submit while the request runs would burn the login rate limit (5/min).
    if (mutation.isPending) return;
    const credentials = readCredentials(event.currentTarget);
    const errors = validateCredentials(credentials);
    setFieldErrors(errors);
    if (Object.keys(errors).length === 0) mutation.mutate(credentials);
    else focusFirstInvalid(event.currentTarget, errors);
  };
  return { fieldErrors, onSubmit, mutation };
}
