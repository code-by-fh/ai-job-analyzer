"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { describeError } from "@/api/describeError";
import { jobQueryOptions, patchJob, type JobDetail } from "@/api/jobs";
import { queryKeys } from "@/api/queryKeys";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { TextAreaField } from "@/ui/Field";
import { useToast } from "@/ui/ToastProvider";
import { useUnsavedChanges } from "@/ui/UnsavedChanges";
import { jobWriteKey, jobWriteScope } from "../jobWrites";

/** Debounce of the old UI's notes autosave (inventory B.4 JobDocumentsTab). */
export const AUTOSAVE_DELAY_MS = 800;
/** Server limit (database/core.py MAX_NOTES_LENGTH). */
export const MAX_NOTES_LENGTH = 20_000;
const NOTES_ROWS = 9;

/** Which notes column an editor writes: the Verlauf notes or the offer outcome notes (T14). */
export interface NotesSpec {
  field: "notes" | "outcome_notes";
  id: string;
  label: MessageKey;
  placeholder: MessageKey;
}

export const JOB_NOTES: NotesSpec = {
  field: "notes",
  id: "job-notes",
  label: "notes.label",
  placeholder: "notes.placeholder",
};

interface NotesTarget {
  job: JobDetail;
  field: NotesSpec["field"];
}

function cacheNotes(queryClient: QueryClient, { job, field }: NotesTarget, notes: string): void {
  queryClient.setQueryData<JobDetail>(queryKeys.job(job.id), (old) =>
    old ? { ...old, [field]: notes } : old,
  );
}

/** Only the answer to the newest request settles the state and the cached job. */
function useOnNotesSaved(
  target: NotesTarget,
  onSaved: (notes: string) => void,
  newest: RefObject<string>,
) {
  const queryClient = useQueryClient();
  return (notes: string) => {
    if (notes !== newest.current) return;
    onSaved(notes);
    cacheNotes(queryClient, target, notes);
  };
}

/** The editor shows its own failure; once it is gone (save sent on leaving) a toast does. */
function useToastAfterLeaving() {
  const { t } = useI18n();
  const toast = useToast();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return (error: unknown) => {
    if (mounted.current) return;
    toast.show({ tone: "error", message: `${t("notes.failed")} ${describeError(error, t)}` });
  };
}

/**
 * Saves run strictly one after the other (scope), so an older answer cannot overwrite newer state.
 */
/** What was sent last; notes adopted from the cache count as sent, the server holds them. */
function useSentNotes({ job, field }: NotesTarget) {
  const sent = useRef(job[field] ?? "");
  const markSent = useCallback((notes: string) => {
    sent.current = notes;
  }, []);
  return { sent, markSent };
}

function useSaveNotes(target: NotesTarget, onSaved: (notes: string) => void) {
  const { sent, markSent } = useSentNotes(target);
  const onSuccess = useOnNotesSaved(target, onSaved, sent);
  const onError = useToastAfterLeaving();
  const { mutate, isPending, error } = useMutation({
    mutationKey: jobWriteKey(target.job.id, target.field),
    scope: jobWriteScope(target.job.id),
    mutationFn: (notes: string) => patchJob(target.job.id, { [target.field]: notes }),
    onSuccess: (_result, notes) => onSuccess(notes),
    onError,
  });
  const send = useCallback(
    (notes: string) => {
      markSent(notes);
      mutate(notes);
    },
    [markSent, mutate],
  );
  return { send, sent, markSent, isPending, error };
}

/** A save still waiting for its pause is sent when the tab is left, not dropped. */
function useFlushOnLeave(
  draft: string,
  save: { send: (notes: string) => void; sent: { current: string } },
) {
  const latestDraft = useRef(draft);
  useEffect(() => {
    latestDraft.current = draft;
  });
  const { send, sent } = save;
  useEffect(
    () => () => {
      const pending = latestDraft.current;
      if (pending !== sent.current && pending.length <= MAX_NOTES_LENGTH) send(pending);
    },
    [send, sent],
  );
}

/**
 * Unsaved notes warn on close/reload only. Moving within the app needs no question, because
 * leaving the tab sends the notes (useFlushOnLeave).
 */
function useUnloadGuard(unsaved: boolean) {
  const { setUnloadWarning } = useUnsavedChanges();
  useEffect(() => setUnloadWarning(unsaved), [unsaved, setUnloadWarning]);
  useEffect(() => () => setUnloadWarning(false), [setUnloadWarning]);
}

/**
 * A save sent while the tab was left may finish after the tab was reopened: take its notes over,
 * unless the user has typed since.
 */
function useAdoptCachedNotes(
  { job, field }: NotesTarget,
  state: { draft: string; saved: string },
  adopt: (notes: string) => void,
) {
  const cached = useQuery({ ...jobQueryOptions(job.id), enabled: false }).data?.[field] ?? null;
  const { draft, saved } = state;
  useEffect(() => {
    if (cached !== null && cached !== saved && draft === saved) adopt(cached);
  }, [cached, draft, saved, adopt]);
}

function useDebouncedSend(
  state: { draft: string; saved: string; tooLong: boolean },
  send: (notes: string) => void,
) {
  const { draft, saved, tooLong } = state;
  useEffect(() => {
    if (draft === saved || tooLong) return;
    const timer = setTimeout(() => send(draft), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [draft, saved, tooLong, send]);
}

type SetText = (text: string) => void;

/** Taking notes over from the cache sets draft and saved state and what was last sent. */
function useAdopt(markSent: SetText, setDraft: SetText, setSaved: SetText): SetText {
  return useCallback(
    (notes: string) => {
      markSent(notes);
      setDraft(notes);
      setSaved(notes);
    },
    [markSent, setDraft, setSaved],
  );
}

function useNotesAutosave(target: NotesTarget) {
  const initial = target.job[target.field] ?? "";
  const [draft, setDraft] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const save = useSaveNotes(target, setSaved);
  const tooLong = draft.length > MAX_NOTES_LENGTH;
  useDebouncedSend({ draft, saved, tooLong }, save.send);
  useFlushOnLeave(draft, save);
  useUnloadGuard(draft !== saved || save.isPending);
  const adopt = useAdopt(save.markSent, setDraft, setSaved);
  useAdoptCachedNotes(target, { draft, saved }, adopt);
  const status = notesStatus({ tooLong, dirty: draft !== saved, hasNotes: saved !== "", ...save });
  return { draft, setDraft, status, error: save.error };
}

interface NotesStatusInput {
  tooLong: boolean;
  dirty: boolean;
  hasNotes: boolean;
  isPending: boolean;
  error: unknown;
}

interface NotesStatus {
  key: MessageKey;
  /** Settled states are announced to screen readers, transitional ones are not. */
  settled: boolean;
}

function notesStatus(input: NotesStatusInput): NotesStatus {
  if (input.tooLong) return { key: "notes.tooLong", settled: true };
  if (input.isPending) return { key: "notes.saving", settled: false };
  if (input.error) return { key: "notes.failed", settled: true };
  if (input.dirty) return { key: "notes.saving", settled: false };
  return input.hasNotes
    ? { key: "notes.saved", settled: true }
    : { key: "notes.idle", settled: false };
}

function NotesStatusLine({ status, error }: { status: NotesStatus; error: unknown }) {
  const { t } = useI18n();
  const failure = status.key === "notes.failed" ? ` ${describeError(error, t)}` : "";
  return (
    <>
      <p className="hint" aria-live="polite">
        {status.settled ? `${t(status.key)}${failure}` : null}
      </p>
      {status.settled ? null : <p className="hint">{t(status.key)}</p>}
    </>
  );
}

/** Autosaving notes; `spec` picks the column (the Verlauf notes by default). */
export function NotesEditor({ job, spec = JOB_NOTES }: { job: JobDetail; spec?: NotesSpec }) {
  const { t } = useI18n();
  const notes = useNotesAutosave({ job, field: spec.field });
  return (
    <section>
      <TextAreaField
        id={spec.id}
        label={t(spec.label)}
        rows={NOTES_ROWS}
        maxLength={MAX_NOTES_LENGTH}
        placeholder={t(spec.placeholder)}
        value={notes.draft}
        onChange={(event) => notes.setDraft(event.target.value)}
      />
      <NotesStatusLine status={notes.status} error={notes.error} />
    </section>
  );
}
