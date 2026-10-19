"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  companyQueryOptions,
  startCompanyResearch,
  startJobCompanyResearch,
  type CompanyProfile,
  type ResearchStart,
} from "@/api/companies";
import type { JobDetail } from "@/api/jobs";
import { queryKeys } from "@/api/queryKeys";
import { jobResearchPhase, researchFailureKey } from "@/domain/companyResearch";
import { firstStart, startStamp } from "@/domain/elapsed";
import { pendingTaskId } from "@/domain/pendingTasks";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { usePendingStart, useTaskPhase } from "@/realtime/usePendingTasks";
import { Button } from "@/ui/Button";
import { Dialog } from "@/ui/Dialog";
import { PanelHeader } from "@/ui/PanelHeader";
import { useJobFormat } from "../format/useJobFormat";
import { TaskProgress, useStartTask, type StartedTask } from "../TaskState";
import { CompanyDomainForm } from "./CompanyDomainForm";
import { CompanyProfileView } from "./CompanyProfileView";
import { DeepDiveList } from "./DeepDiveList";

/**
 * Prototype tabCompany: research start/refresh with live state (company_profile_ready). A research
 * without domain runs before the job has one: it shows here until the server identified the domain.
 */
export function CompanyTab({ job }: { job: JobDetail }) {
  const [changingDomain, setChangingDomain] = useState(false);
  const research = useJobResearch(job, false);
  if (!job.company_domain && research.phase !== "idle" && research.phase !== "failed") {
    return <ResearchRunning job={job} domain={null} research={research} />;
  }
  if (!job.company_domain || changingDomain) {
    return <CompanyDomainForm job={job} onDone={() => setChangingDomain(false)} />;
  }
  return (
    <CompanyResearch
      job={job}
      domain={job.company_domain}
      onChangeDomain={() => setChangingDomain(true)}
    />
  );
}

/**
 * Starts (or with `force` refreshes) the research of a domain. "exists" means a profile appeared
 * since the page loaded: nothing is pending, the profile is reloaded instead (7b ruling 27).
 */
export function useResearch(domain: string, force: boolean) {
  const queryClient = useQueryClient();
  const taskId = pendingTaskId.research(domain);
  const onStarted = (started: ResearchStart) => {
    if (started === "queued") return true;
    void queryClient.invalidateQueries({ queryKey: queryKeys.company(domain) });
    return false;
  };
  const task = useStartTask(taskId, () => startCompanyResearch(domain, force), onStarted);
  return { ...task, phase: useTaskPhase(taskId), startedAt: usePendingStart(taskId) };
}

/**
 * Starts (or with `force` refreshes) the research of the job's company under its stored domain. The
 * phase comes from the job's server run state and the pending task, so it survives a reload.
 */
export function useJobResearch(job: JobDetail, force: boolean) {
  const queryClient = useQueryClient();
  const taskId = pendingTaskId.jobResearch(job.id);
  const onStarted = (started: ResearchStart) => {
    if (started === "queued") return true;
    void queryClient.invalidateQueries({ queryKey: queryKeys.job(job.id) });
    return false;
  };
  const start = () => startJobCompanyResearch(job.id, job.company_domain ?? null, force);
  const task = useStartTask(taskId, start, onStarted);
  const startedAt = firstStart(
    startStamp(job.company_research_started_at),
    usePendingStart(taskId),
  );
  return { ...task, phase: jobResearchPhase(job, useTaskPhase(taskId)), startedAt };
}

interface ResearchProps {
  job: JobDetail;
  domain: string;
  onChangeDomain: () => void;
}

function CompanyResearch({ job, domain, onChangeDomain }: ResearchProps) {
  const { t } = useI18n();
  const company = useQuery(companyQueryOptions(domain));
  if (company.isPending) return <p className="meta">{t("loading")}</p>;
  if (!company.data) return <NoResearch job={job} domain={domain} />;
  return (
    <>
      <p className="meta">{t("company.shared")}</p>
      <CompanyProfileView profile={company.data} />
      <DeepDives job={job} profile={company.data} domain={domain} />
      <ResearchStamp
        job={job}
        profile={company.data}
        domain={domain}
        onChangeDomain={onChangeDomain}
      />
    </>
  );
}

interface DeepDivesProps {
  job: JobDetail;
  profile: CompanyProfile;
  domain: string;
}

function DeepDives({ job, profile, domain }: DeepDivesProps) {
  const { t } = useI18n();
  return (
    <section className="prep-sec">
      <h3 className="sec-title-sm">{t("company.deepDives")}</h3>
      <DeepDiveList
        domain={domain}
        companyName={job.company ?? domain}
        jobTitle={job.title ?? ""}
        items={profile.deep_dive_buttons}
        runs={profile.deep_dive_runs}
      />
    </section>
  );
}

/** No profile yet: while a research is under way show its state, otherwise ask to confirm the address. */
function NoResearch({ job, domain }: { job: JobDetail; domain: string }) {
  const research = useJobResearch(job, false);
  if (research.phase === "idle" || research.phase === "failed") {
    return <CompanyDomainForm job={job} confirming />;
  }
  return <ResearchRunning job={job} domain={domain} research={research} />;
}

interface RunningProps {
  job: JobDetail;
  domain: string | null;
  research: StartedTask;
}

function ResearchRunning({ job, domain, research }: RunningProps) {
  const { t } = useI18n();
  return (
    <div className="dim-panel">
      <h3>{t("company.emptyTitle", { company: job.company ?? domain ?? "" })}</h3>
      <p>{t("company.emptyText")}</p>
      <TaskProgress task={research} runningText={t("company.running")} />
    </div>
  );
}

interface StampProps {
  job: JobDetail;
  profile: CompanyProfile;
  domain: string;
  onChangeDomain: () => void;
}

/** "Neu recherchieren" behind the shared-profile confirmation, or the running research. */
export function RefreshControl({
  research,
  failureKey,
}: {
  research: StartedTask;
  failureKey?: MessageKey | null;
}) {
  const { t } = useI18n();
  return (
    <>
      <TaskProgress task={research} runningText={t("company.running")} failureKey={failureKey} />
      {research.phase === "idle" ? (
        <RefreshButton busy={research.pending} onConfirm={research.run} />
      ) : null}
    </>
  );
}

function RefreshButton({ busy, onConfirm }: { busy: boolean; onConfirm: () => void }) {
  const { t } = useI18n();
  const [asking, setAsking] = useState(false);
  const ask = () => setAsking(true);
  const close = () => setAsking(false);
  const confirm = () => {
    onConfirm();
    close();
  };
  return (
    <>
      <Button size="sm" variant="ghost" icon={RefreshCw} busy={busy} onClick={ask}>
        {t("company.refresh")}
      </Button>
      {asking ? <RefreshDialog onConfirm={confirm} onClose={close} /> : null}
    </>
  );
}

/** The profile is stored once per domain for every user, so overwriting it needs a yes. */
function RefreshDialog({ onConfirm, onClose }: { onConfirm: () => void; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <Dialog open onClose={onClose} label={t("company.refreshTitle")}>
      <div className="panel-in company-dialog">
        <PanelHeader title={t("company.refreshTitle")} onClose={onClose} />
        <p className="prose">{t("company.refreshText")}</p>
        <div className="row panel-actions">
          <Button onClick={onConfirm}>{t("company.refreshConfirm")}</Button>
          <Button variant="ghost" onClick={onClose}>
            {t("guard.cancel")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function ResearchStamp({ job, profile, domain, onChangeDomain }: StampProps) {
  const { t } = useI18n();
  const format = useJobFormat();
  const refresh = useJobResearch(job, true);
  const when = profile.analyzed_at ? format.dateTime(profile.analyzed_at) : null;
  return (
    <div className="ai-stamp">
      {when ? <span>{t("company.stamp", { date: when, domain })}</span> : null}
      <RefreshControl research={refresh} failureKey={researchFailureKey(job)} />
      <Button size="sm" variant="ghost" onClick={onChangeDomain}>
        {t("company.changeDomain")}
      </Button>
      <Link className="link" href={`/companies?domain=${encodeURIComponent(domain)}`}>
        {t("company.all")}
      </Link>
    </div>
  );
}
