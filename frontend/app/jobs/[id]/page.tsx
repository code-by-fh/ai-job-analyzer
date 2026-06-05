"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useAuth, fetchWithAuth } from "../../components/AuthProvider";
import type { Job } from "../../lib/types";
import type { TabType } from "../../components/JobCard/types";
import type { JobStatus } from "../../components/JobStatusBadge";
import { STATUS_PIPELINE } from "../../components/JobCard/constants";
import PageWrapper from "../../components/PageWrapper";
import PipelineTabs from "../../components/JobSidePanel/PipelineTabs";
import StepCard from "../../components/JobSidePanel/StepCard";
import JobOverviewTab from "../../components/JobCard/JobOverviewTab";
import JobApplicationTab from "../../components/JobCard/JobApplicationTab";
import JobInterviewTab from "../../components/JobCard/JobInterviewTab";
import JobCompanyTab from "../../components/JobCard/JobCompanyTab";
import JobStatusTab from "../../components/JobCard/JobStatusTab";
import JobDocumentsTab from "../../components/JobCard/JobDocumentsTab";

const CONTENT_TABS: { id: NonNullable<TabType>; label: string }[] = [
  { id: "overview", label: "Übersicht" },
  { id: "application", label: "Bewerbung" },
  { id: "interview", label: "Interview" },
  { id: "company", label: "Firma" },
  { id: "status", label: "Status" },
  { id: "documents", label: "Dokumente" },
];

export default function JobDetailPage() {
  const { token, logout } = useAuth();
  const params = useParams();
  const router = useRouter();
  const jobId = params.id as string;

  const [job, setJob] = useState<Job | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeContentTab, setActiveContentTab] = useState<NonNullable<TabType>>("overview");

  const apiBase = process.env.NEXT_PUBLIC_API_URL || "";

  useEffect(() => {
    if (!token || !jobId) return;
    setIsLoading(true);
    fetchWithAuth(`${apiBase}/jobs/${jobId}`)
      .then((res) => {
        if (res.status === 401) { logout(); return null; }
        return res.ok ? res.json() : null;
      })
      .then((data: Job | null) => {
        if (data) setJob(data);
      })
      .finally(() => setIsLoading(false));
  }, [token, jobId]);

  const handleStatusUpdate = useCallback(
    async (id: string, status: JobStatus) => {
      const res = await fetchWithAuth(`${apiBase}/jobs/${id}/update-status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setJob((prev) => (prev ? { ...prev, status } : prev));
      }
    },
    [apiBase],
  );

  const handleGenerate = useCallback(async (j: Job) => {
    setIsGenerating(true);
    await fetchWithAuth(`${apiBase}/jobs/${j.id}/generate`, { method: "POST" });
  }, [apiBase]);

  const handleRegenerate = useCallback(async (j: Job, notes: string) => {
    setIsGenerating(true);
    await fetchWithAuth(`${apiBase}/jobs/${j.id}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ improvement_notes: notes || null }),
    });
  }, [apiBase]);

  const handleCancelGenerate = useCallback(async (id: string) => {
    setIsGenerating(false);
    await fetchWithAuth(`${apiBase}/jobs/${id}/cancel-generation`, { method: "POST" });
  }, [apiBase]);

  const handleUpdateJob = useCallback(
    async (id: string, payload: Partial<Job>) => {
      const res = await fetchWithAuth(`${apiBase}/jobs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const updated = await res.json();
        setJob((prev) => (prev ? { ...prev, ...updated } : prev));
      }
    },
    [apiBase],
  );

  const handleArchive = useCallback(
    (id: string) => handleUpdateJob(id, { is_archived: true }),
    [handleUpdateJob],
  );

  const currentStatus = (job?.status || "OPEN") as JobStatus;
  const currentIndex = STATUS_PIPELINE.indexOf(currentStatus);
  const isFirstStep = currentIndex <= 0;
  const isLastStep = currentIndex >= STATUS_PIPELINE.length - 1;

  if (isLoading) {
    return (
      <PageWrapper>
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        </div>
      </PageWrapper>
    );
  }

  if (!job) {
    return (
      <PageWrapper>
        <div className="flex flex-col items-center justify-center py-32 gap-4">
          <p className="text-slate-500 dark:text-slate-400">Job nicht gefunden.</p>
          <button
            onClick={() => router.back()}
            className="text-sm text-indigo-500 hover:underline"
          >
            Zurück
          </button>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      {/* Back link */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Zurück
      </button>

      {/* Job header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          {job.title}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          {job.company}
          {job.match_score != null && (
            <span className="ml-2 text-emerald-500 font-semibold">
              {Math.round(job.match_score)}% Match
            </span>
          )}
        </p>
      </div>

      {/* Pipeline tabs */}
      <div className="mb-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <PipelineTabs
          currentStatus={currentStatus}
          onSelect={(status) => handleStatusUpdate(job.id, status)}
        />
      </div>

      {/* Step card */}
      <div className="mb-6">
        <StepCard
          job={job}
          isGenerating={isGenerating}
          onGenerate={handleGenerate}
          onStatusUpdate={handleStatusUpdate}
          onArchive={handleArchive}
        />
      </div>

      {/* Content tabs */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="border-b border-slate-200 dark:border-slate-800 px-4">
          <div className="flex overflow-x-auto">
            {CONTENT_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveContentTab(tab.id)}
                className={[
                  "px-4 py-3 text-xs font-semibold whitespace-nowrap border-b-2 transition-all",
                  activeContentTab === tab.id
                    ? "border-slate-700 dark:border-slate-300 text-slate-900 dark:text-white"
                    : "border-transparent text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400",
                ].join(" ")}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {activeContentTab === "overview" && (
            <JobOverviewTab
              job={job}
              onTabChange={(tab) => tab && setActiveContentTab(tab)}
              onStatusUpdate={handleStatusUpdate}
              onArchive={handleArchive}
              defaultExpanded
            />
          )}
          {activeContentTab === "application" && (
            <JobApplicationTab
              job={job}
              isGenerating={isGenerating}
              onGenerate={handleGenerate}
              onRegenerate={handleRegenerate}
              onCancelGenerate={handleCancelGenerate}
              onStatusUpdate={handleStatusUpdate}
              onUpdateJob={handleUpdateJob}
              apiBase={apiBase}
            />
          )}
          {activeContentTab === "interview" && (
            <JobInterviewTab job={job} apiBase={apiBase} />
          )}
          {activeContentTab === "company" && (
            <JobCompanyTab job={job} apiBase={apiBase} />
          )}
          {activeContentTab === "status" && (
            <JobStatusTab
              job={job}
              apiBase={apiBase}
              onStatusUpdate={handleStatusUpdate}
              setActiveTab={(tab) => tab && setActiveContentTab(tab)}
            />
          )}
          {activeContentTab === "documents" && (
            <JobDocumentsTab job={job} apiBase={apiBase} />
          )}
        </div>
      </div>

      {/* Footer navigation */}
      <div className="flex gap-3 mt-6">
        {!isFirstStep && (
          <button
            onClick={() =>
              handleStatusUpdate(job.id, STATUS_PIPELINE[currentIndex - 1] as JobStatus)
            }
            className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all active:scale-95"
          >
            ← Zurück
          </button>
        )}
        {!isLastStep && currentStatus !== "OFFER" && (
          <button
            onClick={() =>
              handleStatusUpdate(job.id, STATUS_PIPELINE[currentIndex + 1] as JobStatus)
            }
            className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold transition-all active:scale-95 shadow-sm"
          >
            Schritt erledigt ✓
          </button>
        )}
      </div>
    </PageWrapper>
  );
}
