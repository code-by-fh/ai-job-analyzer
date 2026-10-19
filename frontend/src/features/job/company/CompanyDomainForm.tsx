"use client";

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { startJobCompanyResearch, type ResearchStart } from "@/api/companies";
import { describeError } from "@/api/describeError";
import { fieldErrorsFrom } from "@/api/fieldErrors";
import type { JobDetail } from "@/api/jobs";
import { researchFailureKey } from "@/domain/companyResearch";
import { hostOf } from "@/domain/links";
import { queryKeys } from "@/api/queryKeys";
import { pendingTaskId } from "@/domain/pendingTasks";
import { useI18n } from "@/i18n/useI18n";
import { markTaskStarted } from "@/realtime/usePendingTasks";
import { Button } from "@/ui/Button";
import { TextField } from "@/ui/Field";
import { Notice } from "@/ui/Notice";
import { useToast } from "@/ui/ToastProvider";
import { refreshJobQueries } from "../jobWrites";
import { MAX_DOMAIN_LENGTH, normalizeDomain } from "@/domain/companyDomain";

// Room for a pasted URL; normalizeDomain enforces the real host name limit.
const MAX_INPUT_LENGTH = MAX_DOMAIN_LENGTH * 2;
const DOMAIN_FIELD = "company_domain";
const domainField = (serverField: string) => (serverField === DOMAIN_FIELD ? DOMAIN_FIELD : null);

interface Started {
  jobId: string;
  domain: string | null;
  started: ResearchStart;
}

/** "exists" links a stored profile (only possible with a domain): nothing is pending, it is loaded. */
function noteResearch(queryClient: QueryClient, { jobId, domain, started }: Started): void {
  if (started === "queued") {
    markTaskStarted(queryClient, pendingTaskId.jobResearch(jobId), Date.now());
  } else if (domain) {
    void queryClient.invalidateQueries({ queryKey: queryKeys.company(domain) });
  }
}

interface DomainHandlers {
  onDone?: () => void;
  onRejected: () => void;
}

/** One request stores the typed domain (or none) on the job and starts the research. */
function useSaveDomain(job: JobDetail, { onDone, onRejected }: DomainHandlers) {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const toast = useToast();
  return useMutation({
    mutationFn: (domain: string | null) => startJobCompanyResearch(job.id, domain, false),
    onSuccess: (started, domain) => {
      noteResearch(queryClient, { jobId: job.id, domain, started });
      onDone?.();
    },
    onError: (failure) => {
      if (fieldErrorsFrom(failure, domainField).length > 0) return onRejected();
      toast.show({ tone: "error", message: describeError(failure, t) });
    },
    onSettled: () => refreshJobQueries(queryClient, job.id),
  });
}

function useDomainSubmit(job: JobDetail, onDone?: () => void) {
  const { t } = useI18n();
  const [error, setError] = useState<string | undefined>();
  const onRejected = () => setError(t("company.domainInvalid"));
  const save = useSaveDomain(job, { onDone, onRejected });
  // An empty field is allowed: the server's AI then identifies the domain.
  const submit = (value: string) => {
    const empty = !value.trim();
    const domain = empty ? null : normalizeDomain(value);
    const invalid = !empty && !domain;
    setError(invalid ? t("company.domainInvalid") : undefined);
    if (!invalid) save.mutate(domain);
  };
  return { submit, error, busy: save.isPending };
}

interface DomainInputProps {
  value: string;
  error?: string;
  onChange: (value: string) => void;
}

function DomainInput({ value, error, onChange }: DomainInputProps) {
  const { t } = useI18n();
  return (
    <TextField
      id="company-domain"
      label={t("company.domainLabel")}
      hint={t("company.domainHint")}
      placeholder={t("company.domainPlaceholder")}
      value={value}
      error={error}
      maxLength={MAX_INPUT_LENGTH}
      autoComplete="off"
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

/** Both sides null (no job url, empty or invalid input) is no match. */
function isJobBoardAddress(value: string, jobUrl?: string | null): boolean {
  const host = normalizeDomain(value);
  return host !== null && host === hostOf(jobUrl);
}

function BoardNotice({ value, jobUrl }: { value: string; jobUrl?: string | null }) {
  const { t } = useI18n();
  if (!isJobBoardAddress(value, jobUrl)) return null;
  return <Notice tone="warn">{t("company.boardHint")}</Notice>;
}

/** The end of the last research run on this job, as a fixed text. */
function ResearchFailure({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  const key = researchFailureKey(job);
  return key ? <Notice tone="error">{t(key)}</Notice> : null;
}

interface CompanyDomainFormProps {
  job: JobDetail;
  /** The job already carries a domain the user has not confirmed yet. */
  confirming?: boolean;
  onDone?: () => void;
}

/** The stored value may be the job board or unnormalised: show it as a suggestion, never as fact. */
export function CompanyDomainForm({ job, confirming, onDone }: CompanyDomainFormProps) {
  const { t } = useI18n();
  const [value, setValue] = useState(normalizeDomain(job.company_domain ?? "") ?? "");
  const form = useDomainSubmit(job, onDone);
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    form.submit(value);
  };
  return (
    <form className="company-domain" onSubmit={onSubmit} noValidate>
      {confirming ? <h3 className="sec-title-sm">{t("company.confirmTitle")}</h3> : null}
      <ResearchFailure job={job} />
      <BoardNotice value={value} jobUrl={job.url} />
      <DomainInput value={value} error={form.error} onChange={setValue} />
      <Button type="submit" icon={Building2} busy={form.busy}>
        {t("company.research")}
      </Button>
    </form>
  );
}
