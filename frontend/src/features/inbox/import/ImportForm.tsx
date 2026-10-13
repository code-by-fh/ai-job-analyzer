"use client";

import { useEffect, useState, type FormEvent } from "react";
import { describeError } from "@/api/describeError";
import type { Translate } from "@/i18n/translate";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { TextField } from "@/ui/Field";
import { IMPORT_ERRORS, parseImportUrl } from "./importUrl";
import { useImportJob } from "./useImportJob";

const FIELD_ID = "import-url";

function fieldError(invalid: boolean, error: unknown, t: Translate): string | undefined {
  if (invalid) return t("import.invalidUrl");
  return error ? describeError(error, t, IMPORT_ERRORS) : undefined;
}

/** Validates on submit only, like every form of the app (ui/Field). */
export interface ImportFormProps {
  onStarted: (crawlId: string) => void;
  /** After "Noch einmal versuchen"; the first opening is focused by ModalLayer (data-autofocus). */
  focusOnMount: boolean;
}

export function ImportForm({ onStarted, focusOnMount }: ImportFormProps) {
  const { t } = useI18n();
  const form = useImportForm(onStarted, focusOnMount);
  return (
    <form className="import-block" onSubmit={form.submit} noValidate>
      <TextField
        id={FIELD_ID}
        data-autofocus
        type="url"
        label={t("import.urlLabel")}
        placeholder={t("import.urlPlaceholder")}
        value={form.text}
        onChange={(event) => form.setText(event.target.value)}
        error={form.error}
      />
      <ImportFoot busy={form.busy} />
    </form>
  );
}

function useImportForm(onStarted: (crawlId: string) => void, focusOnMount: boolean) {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const [invalid, setInvalid] = useState(false);
  const start = useImportJob();
  // The form replaces the focused retry button; an unconditional mount focus would make
  // ModalLayer remember the field instead of the trigger and lose the focus on close.
  useEffect(() => {
    if (focusOnMount) document.getElementById(FIELD_ID)?.focus();
  }, [focusOnMount]);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const url = parseImportUrl(text);
    setInvalid(url === null);
    if (url) start.mutate(url, { onSuccess: onStarted });
  };
  const error = fieldError(invalid, start.error, t);
  return { text, setText, submit, error, busy: start.isPending };
}

function ImportFoot({ busy }: { busy: boolean }) {
  const { t } = useI18n();
  return (
    <div className="panel-foot panel-foot-end">
      <Button type="submit" variant="primary" busy={busy}>
        {t("import.submit")}
      </Button>
    </div>
  );
}
