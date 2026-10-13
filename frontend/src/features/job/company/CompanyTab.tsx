"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  companyQueryOptions,
  startCompanyResearch,
  type CompanyProfile,
  type ResearchStart,
} from "@/api/companies";
import type { JobDetail } from "@/api/jobs";
import { queryKeys } from "@/api/queryKeys";
import { pendingTaskId } from "@/domain/pendingTasks";
import { useI18n } from "@/i18n/useI18n";
import { useTaskPhase } from "@/realtime/usePendingTasks";
import { Button } from "@/ui/Button";
import { Dialog } from "@/ui/Dialog";
import { PanelHeader } from "@/ui/PanelHeader";
import { useJobFormat } from "../format/useJobFormat";
import { TaskProgress, useStartTask } from "../TaskState";
import { CompanyDomainForm } from "./CompanyDomainForm";
import { CompanyProfileView } from "./CompanyProfileView";
import { DeepDiveList } from "./DeepDiveList";

/** Prototype tabCompany: research start/refresh with live state (company_profile_ready). */
export function CompanyTab({ job }: { job: JobDetail }) {
  const [changingDomain, setChangingDomain] = useState(false);
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
  return { ...task, phase: useTaskPhase(taskId) };
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
      <ResearchStamp profile={company.data} domain={domain} onChangeDomain={onChangeDomain} />
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
      />
    </section>
  );
}

/** No profile yet: while a research is under way show its state, otherwise ask to confirm the address. */
function NoResearch({ job, domain }: { job: JobDetail; domain: string }) {
  const { t } = useI18n();
  const research = useResearch(domain, false);
  if (research.phase === "idle") return <CompanyDomainForm job={job} confirming />;
  return (
    <div className="dim-panel">
      <h3>{t("company.emptyTitle", { company: job.company ?? domain })}</h3>
      <p>{t("company.emptyText")}</p>
      <TaskProgress task={research} runningText={t("company.running")} />
    </div>
  );
}

interface StampProps {
  profile: CompanyProfile;
  domain: string;
  onChangeDomain: () => void;
}

/** "Neu recherchieren" behind the shared-profile confirmation, or the running research. */
export function RefreshControl({ domain }: { domain: string }) {
  const { t } = useI18n();
  const research = useResearch(domain, true);
  return (
    <>
      <TaskProgress task={research} runningText={t("company.running")} />
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

function ResearchStamp({ profile, domain, onChangeDomain }: StampProps) {
  const { t } = useI18n();
  const format = useJobFormat();
  const when = profile.analyzed_at ? format.dateTime(profile.analyzed_at) : null;
  return (
    <div className="ai-stamp">
      {when ? <span>{t("company.stamp", { date: when, domain })}</span> : null}
      <RefreshControl domain={domain} />
      <Button size="sm" variant="ghost" onClick={onChangeDomain}>
        {t("company.changeDomain")}
      </Button>
      <Link className="link" href={`/companies?domain=${encodeURIComponent(domain)}`}>
        {t("company.all")}
      </Link>
    </div>
  );
}
