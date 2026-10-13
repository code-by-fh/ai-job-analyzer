"use client";

import type { InputHTMLAttributes } from "react";
import { TextAreaField, TextField } from "@/ui/Field";
import type { DatesField, DatesForm } from "./datesForm";

export type SetForm = (update: (form: DatesForm) => DatesForm) => void;

export interface FieldsProps {
  form: DatesForm;
  setForm: SetForm;
  error: (field: DatesField) => string | undefined;
}

type TextKey = Exclude<keyof DatesForm, "contacts">;

interface BoundFieldProps extends Pick<FieldsProps, "form" | "setForm"> {
  name: TextKey;
  id: string;
  label: string;
  error?: string;
  maxLength?: number;
  disabled?: boolean;
  type?: InputHTMLAttributes<HTMLInputElement>["type"];
  inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"];
}

/** A text input bound to one string field of the form. */
export function BoundField({ form, setForm, name, ...field }: BoundFieldProps) {
  return (
    <TextField
      {...field}
      value={form[name]}
      onChange={(event) => setForm((current) => ({ ...current, [name]: event.target.value }))}
    />
  );
}

export function BoundTextArea({ form, setForm, name, ...field }: BoundFieldProps) {
  return (
    <TextAreaField
      id={field.id}
      label={field.label}
      maxLength={field.maxLength}
      error={field.error}
      rows={2}
      value={form[name]}
      onChange={(event) => setForm((current) => ({ ...current, [name]: event.target.value }))}
    />
  );
}
