"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { companyQueryOptions, type CompanyProfile } from "@/api/companies";
import { pendingTaskId } from "@/domain/pendingTasks";
import { CompanyProfileView } from "@/features/job/company/CompanyProfileView";
import { RefreshControl, useResearch } from "@/features/job/company/CompanyTab";
import { DeepDiveList } from "@/features/job/company/DeepDiveList";
import { useJobFormat } from "@/features/job/format/useJobFormat";
import { TaskProgress } from "@/features/job/TaskState";
import { SectionState } from "@/features/profile/SectionState";
import { useI18n } from "@/i18n/useI18n";
import { useTaskPhase } from "@/realtime/usePendingTasks";
import { Button } from "@/ui/Button";
import { isFocusLost } from "@/ui/focus";
import { CompanyAdminActions } from "./CompanyAdminActions";

const PROFILE_HEADING_ID = "company-profile-h";

interface PanelProps {
  domain: string;
  /** The company's display name; the deep dive request clips it to its bound. */
  name: string;
}

const LOADING = "loading";
const WITH_PROFILE = "profile";
const WITHOUT_PROFILE = "none";

/**
 * The start and refresh buttons leave once a research runs, and the progress leaves once the
 * profile arrives: focus that went with them moves to the section title (spec 4.3 #5). Loading
 * takes none, the page decides where focus starts.
 */
function useKeepFocus(shown: string): void {
  const previous = useRef(shown);
  useEffect(() => {
    const before = previous.current;
    previous.current = shown;
    if (before === shown || before === LOADING || !isFocusLost()) return;
    // Only an admin delete or its 404 path drops the profile; leaveForHeading moves focus to the
    // h1 there (7b ruling 28), and a stop at this h2 first would announce two headings.
    if (before.startsWith(WITH_PROFILE) && shown.startsWith(WITHOUT_PROFILE)) return;
    document.getElementById(PROFILE_HEADING_ID)?.focus();
  }, [shown]);
}

function shownState(profile: CompanyProfile | null | undefined, phase: string): string {
  if (profile === undefined) return LOADING;
  return `${profile ? WITH_PROFILE : WITHOUT_PROFILE}:${phase}`;
}

/**
 * D8, 7b ruling 27: the shared profile (AI text through the phase 2 views, never raw HTML) with
 * deep dives and the refresh, or the research start while there is none.
 */
export function CompanyResearchPanel({ domain, name }: PanelProps) {
  const { t } = useI18n();
  const company = useQuery(companyQueryOptions(domain));
  const phase = useTaskPhase(pendingTaskId.research(domain));
  useKeepFocus(shownState(company.data, phase));
  return (
    <section className="company-sec" aria-labelledby={PROFILE_HEADING_ID}>
      <h2 id={PROFILE_HEADING_ID} className="sec-title" tabIndex={-1}>
        {t("companies.profileTitle")}
      </h2>
      <SectionState query={company}>
        {(profile) => <PanelBody profile={profile} domain={domain} name={name} />}
      </SectionState>
    </section>
  );
}

interface ProfileBodyProps extends PanelProps {
  profile: CompanyProfile;
}

function PanelBody({ profile, ...panel }: PanelProps & { profile: CompanyProfile | null }) {
  return profile ? <ProfileBody profile={profile} {...panel} /> : <NoProfile {...panel} />;
}

function ProfileBody({ profile, domain, name }: ProfileBodyProps) {
  const { t } = useI18n();
  return (
    <>
      <p className="meta">{t("company.shared")}</p>
      <CompanyProfileView profile={profile} />
      <section className="prep-sec">
        <h3 className="sec-title-sm">{t("company.deepDives")}</h3>
        <DeepDiveList
          domain={domain}
          companyName={name}
          jobTitle=""
          items={profile.deep_dive_buttons}
          runs={profile.deep_dive_runs}
        />
      </section>
      <ResearchStamp profile={profile} domain={domain} name={name} />
    </>
  );
}

/** The research date, "Neu recherchieren" and, for admins, rename and delete (D9). */
function ResearchStamp({ profile, domain, name }: ProfileBodyProps) {
  const { t } = useI18n();
  const format = useJobFormat();
  const refresh = useResearch(domain, true);
  const when = profile.analyzed_at ? format.dateTime(profile.analyzed_at) : null;
  return (
    <div className="ai-stamp">
      {when ? <span>{t("company.stamp", { date: when, domain })}</span> : null}
      <RefreshControl research={refresh} />
      <CompanyAdminActions domain={domain} name={name} />
    </div>
  );
}

/** No domain confirmation here (D8): the domain comes from the user's job or a checked URL. */
function NoProfile({ domain, name }: PanelProps) {
  const { t } = useI18n();
  const research = useResearch(domain, false);
  return (
    <div className="dim-panel">
      <h3>{t("company.emptyTitle", { company: name })}</h3>
      <p>{t("company.emptyText")}</p>
      <TaskProgress task={research} runningText={t("company.running")} />
      {research.phase === "idle" ? (
        <div className="row">
          <Button busy={research.pending} onClick={research.run}>
            {t("company.research")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
