"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { X, ExternalLink } from "lucide-react";
import type { TabType } from "../JobCard/types";
import type { JobStatus } from "../JobStatusBadge";
import { useLanguage } from "../LanguageProvider";
import PipelineTabs from "./PipelineTabs";
import StepCard from "./StepCard";
import JobOverviewTab from "../JobCard/JobOverviewTab";
import JobApplicationTab from "../JobCard/JobApplicationTab";
import JobInterviewTab from "../JobCard/JobInterviewTab";
import JobCompanyTab from "../JobCard/JobCompanyTab";
import JobDocumentsTab from "../JobCard/JobDocumentsTab";
import type { JobSidePanelProps } from "./types";
import Portal from "../Portal";

const CONTENT_TAB_IDS: NonNullable<TabType>[] = [
  "overview",
  "application",
  "interview",
  "company",
  "documents",
];

function defaultContentTab(status: string): NonNullable<TabType> {
  if (status === "DRAFTED") return "application";
  if (status === "INTERVIEW") return "interview";
  if (status === "OFFER" || status === "ACCEPTED") return "overview";
  return "overview";
}

export default function JobSidePanel({
  isOpen,
  onClose,
  job,
  isGenerating,
  onGenerate,
  onRegenerate,
  onCancelGenerate,
  onStatusUpdate,
  onToggleFavorite,
  onUpdateJob,
  onArchive,
}: JobSidePanelProps) {
  const router = useRouter();
  const { t } = useLanguage();
  const [activeContentTab, setActiveContentTab] = useState<NonNullable<TabType>>("overview");

  const contentTabs: { id: NonNullable<TabType>; label: string }[] = [
    { id: "overview", label: t("overview") },
    { id: "application", label: t("application") },
    { id: "interview", label: t("statusInterview") },
    { id: "company", label: t("companyProfile") },
    { id: "documents", label: t("documents") },
  ];

  // Reset content tab when a different job is opened
  useEffect(() => {
    if (job) {
      setActiveContentTab(defaultContentTab(job.status || "OPEN"));
    }
  }, [job?.id]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  if (!isOpen || !job) return null;

  const apiBase = process.env.NEXT_PUBLIC_API_URL || "";
  const currentStatus = (job.status || "OPEN") as JobStatus;
  return (
    <Portal>
      {/* Backdrop — z-[55] sits above sidebar/bottom-nav (z-50) so they get blurred */}
      <div
        className="fixed inset-0 z-[55] bg-black/30 backdrop-blur-sm animate-in fade-in duration-200 cursor-pointer"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-[60] w-[80vw] max-w-3xl flex flex-col bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl animate-in slide-in-from-right duration-300">

        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-slate-900 dark:text-white truncate">
              {job.title}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {job.company}
              {job.match_score != null && (
                <span className="ml-2 text-emerald-500 font-semibold">
                  {Math.round(job.match_score)}% Match
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => router.push(`/jobs/${job.id}`)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 border border-indigo-200 dark:border-indigo-500/30 rounded-lg transition-all active:scale-95 cursor-pointer"
            >
              <ExternalLink className="w-3 h-3" />
              {t("openPage")}
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all active:scale-90 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Pipeline Tabs */}
        <PipelineTabs
          currentStatus={currentStatus}
          onSelect={(status) => onStatusUpdate(job.id, status)}
        />

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="p-4 space-y-4">

            {/* Current step CTA */}
            <StepCard
              job={job}
              isGenerating={isGenerating}
              onGenerate={onGenerate}
              onStatusUpdate={onStatusUpdate}
              onArchive={onArchive || (() => {})}
            />

            {/* Stellendetails divider */}
            <div className="flex items-center gap-3 -mx-4 px-4">
              <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
              <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 whitespace-nowrap">
                {t("jobDetails")}
              </span>
              <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
            </div>

            {/* Content tab bar */}
            <div className="border-b border-slate-200 dark:border-slate-800 -mx-4 px-4">
              <div className="flex overflow-x-auto">
                {contentTabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveContentTab(tab.id)}
                    className={[
                      "px-3 py-2 text-[11px] font-semibold whitespace-nowrap border-b-2 transition-all cursor-pointer",
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

            {/* Content tab panels */}
            <div>
              {activeContentTab === "overview" && (
                <JobOverviewTab
                  job={job}
                  onTabChange={(tab) => tab && setActiveContentTab(tab)}
                  onStatusUpdate={onStatusUpdate}
                  onArchive={onArchive}
                  defaultExpanded
                />
              )}
              {activeContentTab === "application" && (
                <JobApplicationTab
                  job={job}
                  isGenerating={isGenerating}
                  onGenerate={onGenerate}
                  onRegenerate={onRegenerate}
                  onCancelGenerate={onCancelGenerate}
                  onStatusUpdate={onStatusUpdate}
                  onUpdateJob={onUpdateJob}
                  apiBase={apiBase}
                />
              )}
              {activeContentTab === "interview" && (
                <JobInterviewTab job={job} apiBase={apiBase} />
              )}
              {activeContentTab === "company" && (
                <JobCompanyTab job={job} apiBase={apiBase} />
              )}
              {activeContentTab === "documents" && (
                <JobDocumentsTab job={job} apiBase={apiBase} />
              )}
            </div>
          </div>
        </div>

      </div>
    </Portal>
  );
}
