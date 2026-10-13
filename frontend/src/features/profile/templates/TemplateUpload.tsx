"use client";

import { LoaderCircle, Upload } from "lucide-react";
import type { TemplateKind } from "@/domain/templates";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { Icon } from "@/ui/Icon";
import { Notice } from "@/ui/Notice";
import {
  useTemplatePicker,
  type TemplateFileProblem,
  type TemplatePicker,
} from "./useTemplateUpload";

const UPLOAD_LABEL: Readonly<Record<TemplateKind, MessageKey>> = {
  cv: "profile.templates.uploadCv",
  letter: "profile.templates.uploadLetter",
};
const UPLOAD_HINT: Readonly<Record<TemplateKind, MessageKey>> = {
  cv: "profile.templates.uploadCvHint",
  letter: "profile.templates.uploadLetterHint",
};
const PROBLEM_TEXT: Readonly<Record<TemplateFileProblem, MessageKey>> = {
  unsupportedType: "profile.templates.onlyHtml",
  tooLarge: "profile.templates.tooLarge",
};
// G11: HTML only; the picker offers nothing else, the check after reading holds without it.
const ACCEPT = ".html,.htm,text/html";

/** D10: the last card of a kind's gallery. */
export function TemplateUpload({ kind }: { kind: TemplateKind }) {
  const { t } = useI18n();
  const picker = useTemplatePicker(kind);
  const inputId = `pf-template-upload-${kind}`;
  return (
    <li className="tpl tpl-upload" aria-busy={picker.busy || undefined}>
      <UploadPicker kind={kind} inputId={inputId} picker={picker} />
      <p className="tpl-meta" id={`${inputId}-hint`}>
        {t(UPLOAD_HINT[kind])}
      </p>
      <PickProblem problem={picker.problem} />
    </li>
  );
}

interface UploadPickerProps {
  kind: TemplateKind;
  inputId: string;
  picker: TemplatePicker;
}

/** The label is the visible card (as on the job page); the input keeps the accessible name. */
function UploadPicker({ kind, inputId, picker }: UploadPickerProps) {
  return (
    <>
      <UploadLabel kind={kind} inputId={inputId} busy={picker.busy} />
      <input
        id={inputId}
        className="sr-only"
        type="file"
        accept={ACCEPT}
        aria-describedby={`${inputId}-hint`}
        onChange={picker.pick}
      />
    </>
  );
}

function UploadLabel({
  kind,
  inputId,
  busy,
}: Omit<UploadPickerProps, "picker"> & { busy: boolean }) {
  const { t } = useI18n();
  return (
    <label className="tpl-upload-label" htmlFor={inputId}>
      <Icon icon={busy ? LoaderCircle : Upload} className={busy ? "spin" : undefined} />
      <span>{t(UPLOAD_LABEL[kind])}</span>
    </label>
  );
}

/** Mounted before any problem exists, so a newly shown problem is announced. */
function PickProblem({ problem }: { problem: TemplateFileProblem | null }) {
  const { t } = useI18n();
  return (
    <div role="alert">
      {problem ? (
        <Notice tone="error" announce={false}>
          {t(PROBLEM_TEXT[problem])}
        </Notice>
      ) : null}
    </div>
  );
}
