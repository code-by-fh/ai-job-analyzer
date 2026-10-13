import type { Credentials } from "@/api/auth";
import { describeError } from "@/api/describeError";
import type { MessageKey } from "@/i18n/de";
import type { Translate } from "@/i18n/translate";

export type CredentialField = keyof Credentials;
export type FieldErrors = Partial<Record<CredentialField, MessageKey>>;

/** Usernames are trimmed (copy-paste whitespace); passwords are taken exactly as typed. */
export function readCredentials(form: HTMLFormElement): Credentials {
  const data = new FormData(form);
  return {
    username: String(data.get("username") ?? "").trim(),
    password: String(data.get("password") ?? ""),
  };
}

export function validateCredentials(credentials: Credentials): FieldErrors {
  const errors: FieldErrors = {};
  if (credentials.username === "") errors.username = "login.required";
  if (credentials.password === "") errors.password = "login.required";
  return errors;
}

/** On the login form a 401 means wrong credentials, not an expired session. */
export function loginErrorMessage(error: unknown, t: Translate): string {
  return describeError(error, t, { UNAUTHENTICATED: "login.failed" });
}
