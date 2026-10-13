import { CircleAlert } from "lucide-react";
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { cx } from "./cx";
import { Icon } from "./Icon";
import { Select } from "./Select";

export interface FieldProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}

const hintId = (id: string): string => `${id}-hint`;
const errorId = (id: string): string => `${id}-error`;

/** ids for aria-describedby, so screen readers read hint and error with the control. */
export function describedBy({
  id,
  hint,
  error,
}: Omit<FieldProps, "label" | "children">): string | undefined {
  const ids = [hint ? hintId(id) : null, error ? errorId(id) : null].filter(Boolean);
  return ids.length > 0 ? ids.join(" ") : undefined;
}

/** Label, control slot, hint and error. Errors always carry an icon and words (spec 5). */
export function Field({ id, label, hint, error, children }: FieldProps) {
  return (
    <div className="field">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {children}
      {hint ? (
        <p className="hint" id={hintId(id)}>
          {hint}
        </p>
      ) : null}
      {error ? <FieldError id={errorId(id)} message={error} /> : null}
    </div>
  );
}

/**
 * role="alert" announces the message when it appears. Every form validates on submit only, so an
 * error exists exactly when a submit attempt produced it; this keeps all forms consistent.
 */
function FieldError({ id, message }: { id: string; message: string }) {
  return (
    <p className="field-error" id={id} role="alert">
      <Icon icon={CircleAlert} />
      <span>{message}</span>
    </p>
  );
}

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  id: string;
  label: string;
  hint?: string;
  error?: string;
}

export function TextField({ id, label, hint, error, className, ...inputProps }: TextFieldProps) {
  return (
    <Field id={id} label={label} hint={hint} error={error}>
      <input
        id={id}
        className={cx("input", className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy({ id, hint, error })}
        {...inputProps}
      />
    </Field>
  );
}

export interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> {
  id: string;
  label: string;
  hint?: string;
  error?: string;
}

/** Select inside a Field with hint and error wired through aria-describedby. */
export function SelectField(props: SelectFieldProps) {
  const { id, label, hint, error, children, ...selectProps } = props;
  return (
    <Field id={id} label={label} hint={hint} error={error}>
      <Select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy({ id, hint, error })}
        {...selectProps}
      >
        {children}
      </Select>
    </Field>
  );
}

export interface TextAreaFieldProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "id"
> {
  id: string;
  label: string;
  hint?: string;
  error?: string;
}

export function TextAreaField({
  id,
  label,
  hint,
  error,
  className,
  ...areaProps
}: TextAreaFieldProps) {
  return (
    <Field id={id} label={label} hint={hint} error={error}>
      <textarea
        id={id}
        className={cx("input", className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy({ id, hint, error })}
        {...areaProps}
      />
    </Field>
  );
}

export interface CheckFieldProps {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

/** Checkbox with its label as the click target (prototype .check). */
export function CheckField({ id, label, checked, onChange, disabled }: CheckFieldProps) {
  return (
    <label className="check" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
