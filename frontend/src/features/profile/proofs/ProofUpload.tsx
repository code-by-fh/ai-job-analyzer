"use client";

import { useIsMutating } from "@tanstack/react-query";
import { LoaderCircle, Upload } from "lucide-react";
import { useState, type ChangeEvent } from "react";
import {
  MAX_FILE_BYTES,
  PROOF_DOC_TYPES,
  PROOF_TYPES,
  type ProofDocType,
} from "@/api/profilePaths";
import { uploadProblem, type UploadRules } from "@/features/job/documents/uploadRules";
import { useI18n } from "@/i18n/useI18n";
import { Icon } from "@/ui/Icon";
import { Notice } from "@/ui/Notice";
import { Seg } from "@/ui/Seg";
import { PROOF_TYPE_LABEL } from "./labels";
import { PROOF_UPLOAD_KEY, useUploadProofs } from "./useProofs";

const INPUT_ID = "pf-proof-upload";
const HINT_ID = "pf-proof-upload-hint";
const ACCEPT = PROOF_TYPES.join(",");
// The profile documents endpoint's own limits (profilePaths mirrors core/uploads.py).
const PROOF_RULES: UploadRules = { accepted: PROOF_TYPES, maxBytes: MAX_FILE_BYTES };

type PickHandler = (event: ChangeEvent<HTMLInputElement>) => void;

/** Each file is checked before it is sent; the valid ones go out one after the other (D8). */
function useProofPicker(docType: ProofDocType, onProblems: (texts: string[]) => void): PickHandler {
  const { t } = useI18n();
  const upload = useUploadProofs();
  return (event) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    const problems = files.flatMap((file) => {
      const found = uploadProblem(file, PROOF_RULES);
      if (!found) upload.mutate({ file, docType });
      return found ? [t(`files.${found}`, { name: file.name })] : [];
    });
    onProblems(problems);
  };
}

/** D8: the type first, then one or more files. */
export function ProofUpload() {
  const { t } = useI18n();
  const [docType, setDocType] = useState<ProofDocType>("CERTIFICATE");
  const [problems, setProblems] = useState<string[]>([]);
  const onPick = useProofPicker(docType, setProblems);
  return (
    <div className="proof-upload">
      <ProofTypeSeg value={docType} onChange={setDocType} />
      <ProofPicker onPick={onPick} />
      <p className="meta proof-upload-hint" id={HINT_ID}>
        {t("profile.proofs.uploadHint")}
      </p>
      <PickProblems problems={problems} />
    </div>
  );
}

function ProofTypeSeg(props: { value: ProofDocType; onChange: (value: ProofDocType) => void }) {
  const { t } = useI18n();
  const options = PROOF_DOC_TYPES.map((value) => ({ value, label: t(PROOF_TYPE_LABEL[value]) }));
  return <Seg options={options} label={t("profile.proofs.type")} {...props} />;
}

/** The label is the visible button (as on the job page); the input keeps the accessible name. */
function ProofPicker({ onPick }: { onPick: PickHandler }) {
  return (
    <>
      <PickerLabel />
      <input
        id={INPUT_ID}
        className="sr-only"
        type="file"
        multiple
        accept={ACCEPT}
        aria-describedby={HINT_ID}
        onChange={onPick}
      />
    </>
  );
}

/** Busy while any upload of the queue runs, also one started before the section was mounted again. */
function PickerLabel() {
  const { t } = useI18n();
  const busy = useIsMutating({ mutationKey: PROOF_UPLOAD_KEY }) > 0;
  return (
    <label className="btn btn-sm" htmlFor={INPUT_ID} aria-busy={busy || undefined}>
      <Icon icon={busy ? LoaderCircle : Upload} className={busy ? "spin" : undefined} />
      <span>{t("profile.proofs.upload")}</span>
    </label>
  );
}

/** Mounted before any problem exists, so a newly shown problem is announced. */
function PickProblems({ problems }: { problems: readonly string[] }) {
  return (
    <div role="alert">
      {problems.length > 0 ? (
        <Notice tone="error" announce={false}>
          {problems.join(" ")}
        </Notice>
      ) : null}
    </div>
  );
}
