"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { X, ExternalLink } from "lucide-react";
import type { TabType } from "../JobCard/types";
import type { JobStatus } from "../JobStatusBadge";
import { STATUS_PIPELINE } from "../JobCard/constants";
import PipelineTabs from "./PipelineTabs";
import StepCard from "./StepCard";
import JobOverviewTab from "../JobCard/JobOverviewTab";
import JobApplicationTab from "../JobCard/JobApplicationTab";
import JobInterviewTab from "../JobCard/JobInterviewTab";
import JobCompanyTab from "../JobCard/JobCompanyTab";
import JobDocumentsTab from "../JobCard/JobDocumentsTab";
import type { JobSidePanelProps } from "./types";

const CONTENT_TABS: { id: NonNullable<TabType>; label: string }[] = [
  { id: "overview", label: "Übersicht" },
  { id: "application", label: "Bewerbung" },
  { id: "interview", label: "Interview" },
  { id: "company", label: "Firma" },
  { id: "documents", label: "Dokumente" },
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
  const [activeContentTab, setActiveContentTab] = useState<NonNullable<TabType>>("overview");

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
  const currentIndex = STATUS_PIPELINE.indexOf(currentStatus);
  const isFirstStep = currentIndex <= 0;
  const isLastStep = currentIndex >= STATUS_PIPELINE.length - 1;

  const handleStepForward = () => {
    if (isLastStep) return;
    onStatusUpdate(job.id, STATUS_PIPELINE[currentIndex + 1] as JobStatus);
  };

  const handleStepBack = () => {
    if (isFirstStep) return;
    onStatusUpdate(job.id, STATUS_PIPELINE[currentIndex - 1] as JobStatus);
  };

  return (
    <>
      {/* Backdrop — z-[55] sits above sidebar/bottom-nav (z-50) so they get blurred */}
      <div
        className="fixed inset-0 z-[55] bg-black/30 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-[60] w-[35vw] min-w-[360px] max-w-[600px] flex flex-col bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl animate-in slide-in-from-right duration-300">

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
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 border border-indigo-200 dark:border-indigo-500/30 rounded-lg transition-all active:scale-95"
            >
              <ExternalLink className="w-3 h-3" />
              Seite öffnen
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all active:scale-90"
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

            {/* Content tab bar */}
            <div className="border-b border-slate-200 dark:border-slate-800 -mx-4 px-4">
              <div className="flex overflow-x-auto">
                {CONTENT_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveContentTab(tab.id)}
                    className={[
                      "px-3 py-2 text-[11px] font-semibold whitespace-nowrap border-b-2 transition-all",
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

        {/* Footer */}
        <div className="flex gap-2 px-4 py-3 border-t border-slate-200 dark:border-slate-800 flex-shrink-0">
          {!isFirstStep && (
            <button
              onClick={handleStepBack}
              className="flex-1 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all active:scale-95"
            >
              ← Zurück
            </button>
          )}
          {!isLastStep && currentStatus !== "OFFER" && (
            <button
              onClick={handleStepForward}
              className="flex-1 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold transition-all active:scale-95 shadow-sm"
            >
              Schritt erledigt ✓
            </button>
          )}
        </div>
      </div>
    </>
  );
}
