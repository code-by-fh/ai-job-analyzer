"use client";

import type { InputHTMLAttributes } from "react";
import type { ChannelType, FieldSpec } from "@/api/notificationChannels";
import {
  labelIn,
  type ChannelDraft,
  type ChannelProblems,
  type FieldProblem,
  type SecretMode,
} from "@/domain/notificationChannels";
import type { MessageKey } from "@/i18n/de";
import type { Translate } from "@/i18n/translate";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { TextField } from "@/ui/Field";
import { focusNextFrame } from "@/ui/focus";
import { FIELD_PROBLEM_TEXT } from "./channelText";

type InputKind = Pick<InputHTMLAttributes<HTMLInputElement>, "type" | "inputMode" | "autoComplete">;

/** Secrets are write-only: a password input that never autofills a stored value (R4). */
function inputKind(spec: FieldSpec): InputKind {
  if (spec.secret) return { type: "password", autoComplete: "new-password" };
  if (spec.kind === "email") return { type: "email", inputMode: "email", autoComplete: "off" };
  if (spec.kind === "email_list") return { type: "text", inputMode: "email", autoComplete: "off" };
  if (spec.kind === "port") return { type: "text", inputMode: "numeric", autoComplete: "off" };
  return { type: "text", autoComplete: "off" };
}

/**
 * The service's own words name the field; the app adds what it is for: the list is the channel's
 * default recipients (the old "Standard-Empfänger"), an empty port uses the type's default, and an
 * empty replace input keeps the stored secret.
 */
function fieldHint(spec: FieldSpec, stored: boolean, t: Translate): string | undefined {
  if (stored) return t("settings.notify.secretReplaceHint");
  if (spec.kind === "email_list") {
    return `${t("settings.notify.recipientsHint")} ${t("settings.notify.listHint")}`;
  }
  if (spec.kind === "port" && spec.default)
    return t("settings.notify.portHint", { port: spec.default });
  return undefined;
}

export function problemText(problem: FieldProblem | undefined, spec: FieldSpec, t: Translate) {
  return problem ? t(FIELD_PROBLEM_TEXT[problem], { max: spec.max_items ?? 0 }) : undefined;
}

export interface ChannelFieldsProps {
  /** Prefix of the field ids: one per open form. */
  idPrefix: string;
  type: ChannelType;
  draft: ChannelDraft;
  /** Which secrets the service has stored for this channel; empty for a new channel. */
  storedSecrets: Readonly<Record<string, boolean>>;
  problems: ChannelProblems;
  onChange: (patch: Partial<ChannelDraft>) => void;
}

export const fieldId = (idPrefix: string, name: string) => `${idPrefix}-${name}`;

/** The channel's name, then one field per entry of the type's schema, in the service's order. */
export function ChannelFields(props: ChannelFieldsProps) {
  return (
    <>
      <NameField {...props} />
      {props.type.fields.map((spec) =>
        spec.secret && props.storedSecrets[spec.name] ? (
          <StoredSecret key={spec.name} {...props} spec={spec} />
        ) : (
          <PlainField key={spec.name} {...props} spec={spec} />
        ),
      )}
    </>
  );
}

function NameField({ idPrefix, draft, problems, onChange }: ChannelFieldsProps) {
  const { t } = useI18n();
  return (
    <TextField
      id={fieldId(idPrefix, "name")}
      label={t("settings.notify.name")}
      hint={t("settings.notify.nameHint")}
      autoComplete="off"
      value={draft.name}
      onChange={(event) => onChange({ name: event.target.value })}
      error={problems.name ? t(FIELD_PROBLEM_TEXT[problems.name]) : undefined}
    />
  );
}

interface FieldRowProps extends ChannelFieldsProps {
  spec: FieldSpec;
}

function PlainField({ idPrefix, spec, draft, problems, storedSecrets, onChange }: FieldRowProps) {
  const { t, language } = useI18n();
  const stored = spec.secret && Boolean(storedSecrets[spec.name]);
  return (
    <TextField
      id={fieldId(idPrefix, spec.name)}
      {...inputKind(spec)}
      label={labelIn(spec.label, language)}
      hint={fieldHint(spec, stored, t)}
      value={draft.values[spec.name] ?? ""}
      onChange={(event) =>
        onChange({ values: { ...draft.values, [spec.name]: event.target.value } })
      }
      error={problemText(problems.fields[spec.name], spec, t)}
    />
  );
}

const modeButtonId = (idPrefix: string, name: string, mode: SecretMode) =>
  `${fieldId(idPrefix, name)}-${mode}`;

/** The button that switches a stored secret to a mode: its verb, and the verb plus the field. */
const MODE_TEXT: Readonly<Record<SecretMode, { text: MessageKey; label: MessageKey }>> = {
  keep: { text: "settings.notify.secretKeep", label: "settings.notify.secretKeepLabel" },
  replace: { text: "settings.notify.secretReplace", label: "settings.notify.secretReplaceLabel" },
  remove: { text: "settings.notify.secretRemove", label: "settings.notify.secretRemoveLabel" },
};

/** Where focus goes after a switch: the control that was clicked is gone. */
function focusAfter(idPrefix: string, spec: FieldSpec, next: SecretMode): string {
  if (next === "replace") return fieldId(idPrefix, spec.name);
  return modeButtonId(idPrefix, spec.name, next === "remove" ? "keep" : "replace");
}

/**
 * A stored secret shows only "gesetzt" and offers Ersetzen (an empty password input) and, for an
 * optional secret, Entfernen. Each choice can be undone with Behalten.
 */
function StoredSecret(props: FieldRowProps) {
  const { idPrefix, spec, draft, onChange } = props;
  const mode = draft.secrets[spec.name] ?? "keep";
  const choose = (next: SecretMode) => {
    onChange({
      secrets: { ...draft.secrets, [spec.name]: next },
      values: { ...draft.values, [spec.name]: "" },
    });
    focusNextFrame(() => document.getElementById(focusAfter(idPrefix, spec, next)));
  };
  if (mode === "replace") return <ReplaceSecret {...props} onChoose={choose} />;
  return <SecretState {...props} mode={mode} onChoose={choose} />;
}

interface SecretChoiceProps extends FieldRowProps {
  onChoose: (mode: SecretMode) => void;
}

interface ModeButtonProps extends SecretChoiceProps {
  to: SecretMode;
}

function ModeButton({ idPrefix, spec, to, onChoose }: ModeButtonProps) {
  const { t, language } = useI18n();
  const field = labelIn(spec.label, language);
  return (
    <Button
      id={modeButtonId(idPrefix, spec.name, to)}
      size="sm"
      variant="ghost"
      aria-label={t(MODE_TEXT[to].label, { field })}
      onClick={() => onChoose(to)}
    >
      {t(MODE_TEXT[to].text)}
    </Button>
  );
}

/** The label names the group of the state line and its buttons; nothing of the value is shown. */
function SecretState(props: SecretChoiceProps & { mode: SecretMode }) {
  const { t, language } = useI18n();
  const { idPrefix, spec, mode } = props;
  const labelId = `${fieldId(idPrefix, spec.name)}-label`;
  const removing = mode === "remove";
  return (
    <div className="field chan-secret" role="group" aria-labelledby={labelId}>
      <p className="label" id={labelId}>
        {labelIn(spec.label, language)}
      </p>
      <div className="chan-secret-row">
        <span className="chan-secret-state">
          {t(removing ? "settings.notify.secretRemoving" : "settings.notify.secretSet")}
        </span>
        {removing ? <ModeButton {...props} to="keep" /> : <ModeButton {...props} to="replace" />}
        {removing || spec.required ? null : <ModeButton {...props} to="remove" />}
      </div>
    </div>
  );
}

/** Replacing: an empty password input; left empty, the stored value stays. */
function ReplaceSecret(props: SecretChoiceProps) {
  return (
    <div className="chan-replace">
      <PlainField {...props} />
      <ModeButton {...props} to="keep" />
    </div>
  );
}
