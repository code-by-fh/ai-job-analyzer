"use client";

import { Check, Download, ExternalLink } from "lucide-react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { describeError } from "@/api/describeError";
import {
  DOCUMENT_KINDS,
  downloadJobDocument,
  generatedDocument,
  jobDocumentsQueryOptions,
} from "@/api/jobDocuments";
import { patchJob, type JobDetail } from "@/api/jobs";
import { addDays, fromDateInputValue, toDateInputValue } from "@/domain/calendar";
import { CHECKLIST_KEYS, checklistOf, type ChecklistKey } from "@/domain/checklist";
import { safeHref } from "@/domain/links";
import { FOLLOW_UP_DAYS } from "@/domain/nextStep";
import { useI18n } from "@/i18n/useI18n";
import { useNow } from "@/lib/clock";
import { Button } from "@/ui/Button";
import { CheckField, TextField } from "@/ui/Field";
import { Icon } from "@/ui/Icon";
import { useToast } from "@/ui/ToastProvider";
import { DRIVE_UNSUPPORTED, saveFile } from "../documents/saveFile";
import { useJobFormat } from "../format/useJobFormat";
import { useChangeStatus } from "../phase/useChangeStatus";
import { refreshJobQueries } from "../jobWrites";
import { useTick, type Tick } from "./useChecklist";

/** Prototype renderApplyChecklist, inside the next-step card (usability #8); stored in jobs.checklist (B7). */
export function ApplyChecklist({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  const tick = useTick(job);
  const checklist = checklistOf(job.checklist);
  return (
    <ol role="list" className="checklist" aria-label={t("checklist.label")}>
      {CHECKLIST_KEYS.map((item, index) => (
        <ChecklistStep
          key={item}
          job={job}
          number={index + 1}
          item={item}
          done={checklist[item]}
          onTick={tick}
        />
      ))}
    </ol>
  );
}

interface ChecklistStepProps {
  job: JobDetail;
  number: number;
  item: ChecklistKey;
  done: boolean;
  onTick: Tick;
}

const STEP_TITLE = {
  posting_opened: "checklist.step1",
  documents_checked: "checklist.step2",
  sent: "checklist.step3",
} as const;

function StepNumber({ number, done }: { number: number; done: boolean }) {
  return (
    <span className="cl-num" aria-hidden="true">
      {done ? <Icon icon={Check} /> : number}
    </span>
  );
}

function ChecklistStep({ job, number, item, done, onTick }: ChecklistStepProps) {
  const { t } = useI18n();
  return (
    <li className={done ? "cl-item done" : "cl-item"}>
      <StepNumber number={number} done={done} />
      <div className="cl-body">
        <div className="cl-title">{t(STEP_TITLE[item])}</div>
        <CheckField
          id={`checklist-${item}`}
          label={t(`checklist.${item}`)}
          checked={done}
          onChange={(value) => onTick(item, value)}
        />
        <div className="row">
          <StepAction job={job} item={item} onTick={onTick} />
        </div>
      </div>
    </li>
  );
}

function StepAction({ job, item, onTick }: Pick<ChecklistStepProps, "job" | "item" | "onTick">) {
  if (item === "posting_opened") return <PostingLink job={job} onOpen={() => onTick(item)} />;
  if (item === "documents_checked") return <DownloadBoth job={job} onDone={() => onTick(item)} />;
  return <MarkApplied job={job} />;
}

function PostingLink({ job, onOpen }: { job: JobDetail; onOpen: () => void }) {
  const { t } = useI18n();
  const href = safeHref(job.url);
  if (!href) return null;
  return (
    <a
      className="btn btn-sm"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onOpen}
    >
      <Icon icon={ExternalLink} />
      <span>{t("checklist.openPosting", { company: job.company ?? "" })}</span>
    </a>
  );
}

/** Saves every generated PDF that exists; returns how many were saved. */
async function downloadGenerated(queryClient: QueryClient, jobId: string): Promise<number> {
  const documents = await queryClient.fetchQuery(jobDocumentsQueryOptions(jobId));
  let saved = 0;
  for (const kind of DOCUMENT_KINDS) {
    const document = generatedDocument(documents, kind);
    if (!document) continue;
    saveFile(await downloadJobDocument(jobId, document.id), document.original_filename);
    saved += 1;
  }
  return saved;
}

function useDownloadBoth(job: JobDetail, onDone: () => void) {
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      const saved = await downloadGenerated(queryClient, job.id);
      if (saved === 0) toast.show({ tone: "error", message: t("checklist.noDocuments") });
      else onDone();
    } catch (error) {
      toast.show({ tone: "error", message: describeError(error, t, DRIVE_UNSUPPORTED) });
    } finally {
      setBusy(false);
    }
  };
  return { download, busy };
}

function DownloadBoth({ job, onDone }: { job: JobDetail; onDone: () => void }) {
  const { t } = useI18n();
  const { download, busy } = useDownloadBoth(job, onDone);
  return (
    <Button size="sm" icon={Download} busy={busy} onClick={() => void download()}>
      {t("checklist.downloadBoth")}
    </Button>
  );
}

/** Date state and validation; a future or impossible day is refused before any request. */
function useApplyDate(job: JobDetail) {
  const { t } = useI18n();
  const today = toDateInputValue(new Date(useNow()));
  const [value, setValue] = useState(today);
  const [error, setError] = useState<string | undefined>();
  const { markApplied, isPending } = useMarkApplied(job);
  const submit = () => {
    const picked = fromDateInputValue(value);
    if (!picked || value > today) return setError(t("checklist.invalidDate"));
    setError(undefined);
    void markApplied(picked, value !== today);
  };
  return { today, value, setValue, error, submit, isPending };
}

/** Step 3: the status change itself. A past date goes into the history note (backend gap G10). */
function MarkApplied({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  const date = useApplyDate(job);
  return (
    <div className="apply-row">
      <TextField
        id="apply-date"
        type="date"
        label={t("checklist.applyDate")}
        value={date.value}
        max={date.today}
        error={date.error}
        onChange={(event) => date.setValue(event.target.value)}
      />
      <Button size="sm" icon={Check} busy={date.isPending} onClick={date.submit}>
        {t("checklist.markApplied")}
      </Button>
    </div>
  );
}

/** The reminder is a convenience: when only it fails, the user must know the status did change. */
async function saveFollowUp(queryClient: QueryClient, jobId: string, due: Date): Promise<boolean> {
  try {
    await patchJob(jobId, { next_follow_up_at: due.toISOString() });
    refreshJobQueries(queryClient, jobId);
    return true;
  } catch {
    return false;
  }
}

/** Goes through the one guarded status change, then suggests the follow-up reminder. */
function useMarkApplied(job: JobDetail) {
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const format = useJobFormat();
  const { changeStatus, isPending } = useChangeStatus(job);
  const markApplied = async (picked: Date, backdated: boolean) => {
    const note = backdated
      ? t("checklist.appliedOn", { date: format.date(picked.toISOString()) })
      : undefined;
    const updated = await changeStatus(note ? { to: "APPLIED", note } : { to: "APPLIED" });
    if (!updated) return;
    const saved = await saveFollowUp(queryClient, job.id, addDays(picked, FOLLOW_UP_DAYS));
    if (!saved) toast.show({ tone: "error", message: t("checklist.followUpNotSaved") });
  };
  return { markApplied, isPending };
}
