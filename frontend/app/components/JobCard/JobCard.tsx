import {
  Star,
  Trash2,
  RotateCcw,
  ChevronDown,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { useLanguage } from "../LanguageProvider";

import { STATUS_META } from "./constants";
import type { JobCardProps, TabType } from "./types";

import JobApplicationTab from "./JobApplicationTab";
import JobCompanyTab from "./JobCompanyTab";
import JobDocumentsTab from "./JobDocumentsTab";
import JobInterviewTab from "./JobInterviewTab";
import JobOverviewTab from "./JobOverviewTab";
import JobStatusTab from "./JobStatusTab";

import { TranslationKey } from "../../lib/languages";

const TABS: {
  id: TabType & string;
  labelKey: TranslationKey;
  labelFallback: string;
  shortLabelKey: TranslationKey;
  shortLabelFallback: string;
}[] = [
  {
    id: "overview",
    labelKey: "overview",
    labelFallback: "Overview",
    shortLabelKey: "shortInfo",
    shortLabelFallback: "Info",
  },
  {
    id: "application",
    labelKey: "application",
    labelFallback: "Application",
    shortLabelKey: "shortApp",
    shortLabelFallback: "App",
  },
  {
    id: "interview",
    labelKey: "interviewPrep",
    labelFallback: "Interview",
    shortLabelKey: "shortInt",
    shortLabelFallback: "Int",
  },
  {
    id: "company",
    labelKey: "companyProfile",
    labelFallback: "Company",
    shortLabelKey: "shortCo",
    shortLabelFallback: "Co",
  },
  {
    id: "status",
    labelKey: "status",
    labelFallback: "Status",
    shortLabelKey: "shortStatus",
    shortLabelFallback: "Status",
  },
  {
    id: "documents",
    labelKey: "documents",
    labelFallback: "Documents",
    shortLabelKey: "shortDocs",
    shortLabelFallback: "Docs",
  },
];

export default function JobCard({
  job,
  isGenerating,
  onGenerate,
  onRegenerate,
  onCancelGenerate,
  onStatusUpdate,
  onToggleFavorite,
  isSelected = false,
  onSelect,
  onUpdateJob,
  onArchive,
  apiBase = process.env.NEXT_PUBLIC_API_URL || "",
  isModal = false,
}: JobCardProps) {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [isDescOpen, setIsDescOpen] = useState(false);
  const descRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      if ((e as CustomEvent).detail?.jobId === job.id) {
        setIsDescOpen(true);
        setTimeout(() => {
          descRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }, 50);
      }
    };
    window.addEventListener("showJobDescription", handler);
    return () => window.removeEventListener("showJobDescription", handler);
  }, [job.id]);

  const timeAgo = (dateString?: string) => {
    if (!dateString) return "";
    const diff = (Date.now() - new Date(dateString).getTime()) / 1000;
    if (diff > 86400) return Math.floor(diff / 86400) + (t("dayUnit") || "d");
    if (diff > 3600) return Math.floor(diff / 3600) + (t("hourUnit") || "h");
    if (diff > 60) return Math.floor(diff / 60) + (t("minUnit") || "m");
    return t("now") || "Now";
  };

  const currentStatus = job.status || "OPEN";
  const statusMeta = STATUS_META[currentStatus] || STATUS_META["OPEN"];

  return (
    <div
      className={`
            group relative flex flex-col min-h-full
            transition-all duration-300 hover:shadow-lg dark:hover:shadow-none hover:z-10
            ${isModal ? "rounded-none border-none" : "rounded-2xl border overflow-hidden"}
            ${
              isSelected
                ? "bg-indigo-50/60 dark:bg-indigo-900/20 border-indigo-300 dark:border-indigo-700 shadow-md"
                : `bg-white dark:bg-slate-900 ${isGenerating ? "border-indigo-300 dark:border-indigo-600" : statusMeta.cardBorder || "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"}`
            }
        `}
    >
      {/* Generating progress bar */}
      {isGenerating && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-indigo-100 dark:bg-indigo-900 overflow-hidden z-20">
          <div className="h-full w-2/5 bg-indigo-500 animate-shimmer" />
        </div>
      )}

      {/* Subtle hover glow */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/3 to-purple-500/3 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

      {/* ── HEADER ── */}
      <div className="flex items-start gap-2 px-4 pt-4 pb-0 sm:px-5 sm:pt-5">
        {/* Title block */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            {/* Title + company */}
            <div className="min-w-0 flex-1">
              <h2
                className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-snug line-clamp-2 sm:line-clamp-1"
                title={job.title}
              >
                {job.url ? (
                  <a
                    href={job.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                  >
                    {job.company_domain} | {job.title}
                  </a>
                ) : (
                  job.title
                )}
              </h2>
            </div>

            {/* Actions: checkbox + favorite */}
            <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
              {onSelect && (
                <label className="relative flex items-center justify-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={isSelected}
                    onChange={(e) => onSelect(job.id, e.target.checked)}
                  />
                  <div
                    className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all duration-200
                                        ${isSelected ? "bg-indigo-500 border-indigo-500 shadow-sm shadow-indigo-500/30" : "bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 hover:border-indigo-400"}`}
                  >
                    <svg
                      className={`w-3 h-3 text-white transition-transform duration-200 ${isSelected ? "scale-100" : "scale-0"}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                </label>
              )}
              {job.is_archived && (
                <>
                  {onUpdateJob && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdateJob(job.id, { is_archived: false });
                      }}
                      className="w-7 h-7 flex items-center justify-center rounded-lg transition-all active:scale-90 cursor-pointer text-slate-300 dark:text-slate-600 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 border border-transparent hover:border-indigo-200 dark:hover:border-indigo-500/30"
                      title={t("restoreJob")}
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  )}
                  {onArchive && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onArchive(job.id);
                      }}
                      className="w-7 h-7 flex items-center justify-center rounded-lg transition-all active:scale-90 cursor-pointer text-slate-300 dark:text-slate-600 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 border border-transparent hover:border-rose-200 dark:hover:border-rose-500/30"
                      title={t("deletePermanent")}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </>
              )}
              <button
                onClick={() =>
                  onToggleFavorite(job.id, job.is_favorite || false)
                }
                className={`w-7 h-7 flex items-center justify-center rounded-lg transition-all active:scale-90 cursor-pointer text-base
                                    ${
                                      job.is_favorite
                                        ? "bg-amber-50 dark:bg-amber-500/10 text-amber-500 border border-amber-200 dark:border-amber-500/30"
                                        : "text-slate-300 dark:text-slate-600 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/10 border border-transparent hover:border-amber-200 dark:hover:border-amber-500/30"
                                    }`}
                title={
                  job.is_favorite
                    ? t("removeFromFavorites")
                    : t("addToFavorites")
                }
              >
                {job.is_favorite ? (
                  <Star className="w-4 h-4 fill-amber-500" />
                ) : (
                  <Star className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── TAB NAV ── */}
      <div className="flex gap-0 overflow-x-auto scrollbar-none border-b border-slate-100 dark:border-slate-800 mt-3 px-4 sm:px-5">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as TabType)}
            className={`
                            px-2.5 sm:px-3 py-2 text-[11px] sm:text-xs font-medium whitespace-nowrap
                            border-b-2 transition-colors cursor-pointer flex-shrink-0 flex items-center gap-1
                            ${
                              activeTab === tab.id
                                ? "border-indigo-500 text-indigo-600 dark:text-indigo-400"
                                : "border-transparent text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
                            }
                        `}
          >
            <span className="sm:hidden">
              {t(tab.shortLabelKey) || tab.shortLabelFallback}
            </span>
            <span className="hidden sm:inline">
              {t(tab.labelKey) || tab.labelFallback}
            </span>
            {tab.id === "application" && isGenerating && (
              <Loader2 className="w-3 h-3 animate-spin text-indigo-500 flex-shrink-0" />
            )}
          </button>
        ))}
      </div>

      {/* ── TAB CONTENT ── */}
      <div
        className={`px-4 sm:px-5 py-4 flex-1 flex flex-col ${job.description ? "border-b border-slate-100 dark:border-slate-800/50" : "pb-8"}`}
      >
        {activeTab === "overview" && (
          <JobOverviewTab
            job={job}
            onTabChange={setActiveTab}
            onArchive={onArchive}
            onStatusUpdate={onStatusUpdate}
          />
        )}
        {activeTab === "application" && (
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
        {activeTab === "interview" && (
          <JobInterviewTab job={job} apiBase={apiBase} />
        )}
        {activeTab === "company" && (
          <JobCompanyTab job={job} apiBase={apiBase} />
        )}
        {activeTab === "status" && (
          <JobStatusTab
            job={job}
            apiBase={apiBase}
            onStatusUpdate={onStatusUpdate}
            setActiveTab={setActiveTab}
          />
        )}
        {activeTab === "documents" && (
          <JobDocumentsTab job={job} apiBase={apiBase} />
        )}
      </div>

      {/* ── DESCRIPTION TOGGLE ── */}
      {job.description && (
        <div
          ref={descRef}
          className="border-t border-slate-50 dark:border-slate-800/40"
        >
          <button
            onClick={() => setIsDescOpen((o) => !o)}
            className="
                            w-full px-4 sm:px-5 py-3 text-[11px] font-bold text-slate-400 dark:text-slate-500
                            cursor-pointer select-none
                            flex items-center gap-2
                            hover:text-indigo-500 dark:hover:text-indigo-400
                            hover:bg-indigo-50/30 dark:hover:bg-indigo-500/5
                            transition-all duration-200
                        "
          >
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-300 flex-shrink-0 ${isDescOpen ? "rotate-180" : ""}`}
            />
            <span className="uppercase tracking-widest">
              {t("jobDescription") || "Job Description"}
            </span>
            <span className="flex-1" />
            {job.url && (
              <a
                href={job.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1.5 text-indigo-500 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-black transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                <span className="hidden sm:inline uppercase tracking-tighter">
                  {t("applySource") || "Reference"}
                </span>
              </a>
            )}
          </button>
          {isDescOpen && (
            <div className="px-4 sm:px-5 pb-10 pt-3 prose prose-sm dark:prose-invert max-w-none text-sm border-t border-slate-100 dark:border-slate-800/50">
              <ReactMarkdown>{job.description}</ReactMarkdown>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
