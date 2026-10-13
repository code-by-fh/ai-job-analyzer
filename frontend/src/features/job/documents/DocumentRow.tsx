"use client";

import { useQuery } from "@tanstack/react-query";
import { FileText, LoaderCircle, RefreshCw } from "lucide-react";
import { useState, type ReactNode } from "react";
import { generatedDocument, jobDocumentsQueryOptions, type DocumentKind } from "@/api/jobDocuments";
import type { JobDetail } from "@/api/jobs";
import { documentPresence } from "@/domain/documents";
import { isGenerating } from "@/domain/jobStatus";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { TextField } from "@/ui/Field";
import { Icon } from "@/ui/Icon";
import { useJobFormat } from "../format/useJobFormat";
import { DOCUMENT_LABEL } from "../labels";
import { useGeneration, type GenerationRequest } from "./useGeneration";

export interface DocumentRowProps {
  job: JobDetail;
  kind: DocumentKind;
  attach: boolean;
  actions?: ReactNode;
}

interface RowActionProps {
  job: JobDetail;
  kind: DocumentKind;
  onToggle: () => void;
}

function RowAction({ job, kind, onToggle }: RowActionProps) {
  const { t } = useI18n();
  const exists = documentPresence(job)[kind];
  const icon = exists ? RefreshCw : undefined;
  return (
    <Button size="sm" icon={icon} disabled={isGenerating(job)} onClick={onToggle}>
      {t(exists ? "docs.recreate" : "docs.create")}
    </Button>
  );
}

function RowHead({ job, kind }: { job: JobDetail; kind: DocumentKind }) {
  const { t } = useI18n();
  const busy = isGenerating(job);
  return (
    <div className="docrow-top">
      <Icon icon={busy ? LoaderCircle : FileText} className={busy ? "spin" : undefined} />
      <div>
        <span className="docrow-name">{t(DOCUMENT_LABEL[kind])}</span>
        <RowState job={job} kind={kind} />
      </div>
    </div>
  );
}

/** One document: name, state and the "Erstellen" / "Neu erstellen" verb with its optional note. */
export function DocumentRow({ job, kind, attach, actions }: DocumentRowProps) {
  const { t } = useI18n();
  const [noteOpen, setNoteOpen] = useState(false);
  return (
    <div className="docrow" role="group" aria-label={t(DOCUMENT_LABEL[kind])}>
      <RowHead job={job} kind={kind} />
      <div className="docrow-actions">
        <RowAction job={job} kind={kind} onToggle={() => setNoteOpen(!noteOpen)} />
        {actions}
      </div>
      {noteOpen && !isGenerating(job) ? (
        <NotePanel job={job} kind={kind} attach={attach} onDone={() => setNoteOpen(false)} />
      ) : null}
    </div>
  );
}

function RowState({ job, kind }: { job: JobDetail; kind: DocumentKind }) {
  const { t } = useI18n();
  const format = useJobFormat();
  const documents = useQuery(jobDocumentsQueryOptions(job.id)).data ?? [];
  const uploadedAt = generatedDocument(documents, kind)?.uploaded_at;
  const exists = documentPresence(job)[kind];
  let text = t("docs.stateNone");
  if (isGenerating(job)) text = t("docs.stateRunning");
  else if (exists && uploadedAt) text = t("docs.stateReady", { date: format.dateTime(uploadedAt) });
  else if (exists) text = t("docs.stateReadyUndated");
  return (
    <div className="docrow-state" aria-live="polite">
      {text}
    </div>
  );
}

function requestFor(kind: DocumentKind, notes: string, attach: boolean): GenerationRequest {
  return kind === "cv"
    ? { kind: "cv", notes, includeProfileDocuments: attach }
    : { kind: "cover_letter", notes };
}

interface NotePanelProps {
  job: JobDetail;
  kind: DocumentKind;
  attach: boolean;
  onDone: () => void;
}

interface NoteActionsProps {
  starting: boolean;
  onSubmit: () => void;
  onDone: () => void;
}

function NoteActions({ starting, onSubmit, onDone }: NoteActionsProps) {
  const { t } = useI18n();
  return (
    <div className="row">
      <Button size="sm" variant="primary" busy={starting} onClick={onSubmit}>
        {t("docs.createNow")}
      </Button>
      <Button size="sm" variant="ghost" onClick={onDone}>
        {t("guard.cancel")}
      </Button>
    </div>
  );
}

// Server bound for both notes (GenerateRequest.improvement_notes, cv_draft MAX_DRAFT_LENGTH).
const MAX_NOTE_LENGTH = 50_000;

function NotePanel({ job, kind, attach, onDone }: NotePanelProps) {
  const { t } = useI18n();
  const [notes, setNotes] = useState("");
  const generation = useGeneration(job);
  // Closing only on success keeps the typed note when the start fails.
  const submit = () => generation.start(requestFor(kind, notes, attach), { onSuccess: onDone });
  const field = {
    id: `note-${kind}`,
    label: t("docs.note"),
    placeholder: t("docs.notePlaceholder"),
    maxLength: MAX_NOTE_LENGTH,
  };
  return (
    <div className="docrow-instr">
      <TextField {...field} value={notes} onChange={(event) => setNotes(event.target.value)} />
      <NoteActions starting={generation.starting} onSubmit={submit} onDone={onDone} />
    </div>
  );
}
