import React, { useEffect, useState } from "react";
import {
  Loader2,
  Check,
  Clock,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import * as LucideIcons from "lucide-react";

const DynamicIcon = ({
  name,
  className,
}: {
  name: string;
  className?: string;
}) => {
  const IconComponent = (LucideIcons as any)[name];
  if (!IconComponent) return null;
  return <IconComponent className={className} />;
};
import type { Job } from "../../lib/types";
import type { JobStatus } from "../JobStatusBadge";
import { STATUS_GUIDANCE, STATUS_META, STATUS_PIPELINE } from "./constants";
import type { TabType } from "./types";
import { fetchWithAuth } from "../AuthProvider";
import { useLanguage } from "../LanguageProvider";

interface JobStatusTabProps {
  job: Job;
  apiBase: string;
  onStatusUpdate: (jobId: string, status: JobStatus) => void;
  setActiveTab: (tab: TabType) => void;
}

export default function JobStatusTab({
  job,
  apiBase,
  onStatusUpdate,
  setActiveTab,
}: JobStatusTabProps) {
  const { t } = useLanguage();
  const [history, setHistory] = useState<any[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (history === null && !historyLoading) {
      setHistoryLoading(true);
      fetchWithAuth(`${apiBase}/jobs/${job.id}/history`)
        .then((r) => r.json())
        .then((data) => {
          if (mounted) setHistory(data);
        })
        .catch(() => {
          if (mounted) setHistory([]);
        })
        .finally(() => {
          if (mounted) setHistoryLoading(false);
        });
    }
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id]);

  const currentStatus = job.status || "OPEN";
  const statusMeta = STATUS_META[currentStatus] || STATUS_META["OPEN"];
  const currentIdx = STATUS_PIPELINE.indexOf(currentStatus as JobStatus);
  const isExitStatus =
    currentStatus === "REJECTED" || currentStatus === "FAILED";
  const canReject =
    ["APPLIED", "INTERVIEW", "OFFER"].includes(currentStatus) ||
    currentStatus === "REJECTED";
  const guidance = STATUS_GUIDANCE[currentStatus] ?? STATUS_GUIDANCE["OPEN"];

  const dynamicItems = guidance.items.map((item) => {
    if (item.id === "has_draft")
      return { ...item, done: !!job.application_draft };
    if (item.id === "has_followup")
      return { ...item, done: !!job.next_follow_up_at };
    if (item.id === "has_prep")
      return { ...item, done: !!job.interview_prep_material };
    return item;
  });

  return (
    <div className="space-y-5">
      {/* Pipeline Stepper */}
      <div>
        <p className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-widest mb-4">
          {t("applicationPipeline")}
        </p>
        <div className="relative flex items-start justify-between overflow-x-auto pb-2 gap-1">
          {/* Background connector */}
          <div className="absolute top-4 left-4 right-4 h-0.5 bg-slate-200 dark:bg-slate-700" />
          {/* Filled connector */}
          {!isExitStatus && currentIdx > 0 && (
            <div
              className={`absolute top-4 left-4 h-0.5 transition-all duration-500 ${statusMeta.connectorCls}`}
              style={{
                width: `calc(${(currentIdx / (STATUS_PIPELINE.length - 1)) * 100}% - 2rem)`,
              }}
            />
          )}
          {STATUS_PIPELINE.map((s, i) => {
            const meta = STATUS_META[s];
            const isDone = !isExitStatus && currentIdx > i;
            const isCurrent = !isExitStatus && currentIdx === i;
            return (
              <button
                key={s}
                onClick={() => onStatusUpdate(job.id, s)}
                className="relative flex flex-col items-center gap-1.5 cursor-pointer group/step z-10 flex-1 min-w-[50px]"
                title={t(meta.labelKey)}
              >
                <div
                  className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm transition-all duration-300
                                    ${
                                      isDone
                                        ? meta.stepDone
                                        : isCurrent
                                          ? meta.stepActive
                                          : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-300 dark:text-slate-600 group-hover/step:border-slate-400 dark:group-hover/step:border-slate-500"
                                    }`}
                >
                  {isDone ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <DynamicIcon name={meta.icon} className="w-4 h-4" />
                  )}
                </div>
                <span
                  className={`text-[8px] sm:text-[9px] font-semibold text-center leading-tight block transition-colors
                                    ${isCurrent ? "text-slate-800 dark:text-slate-100 font-bold" : isDone ? "text-slate-400 dark:text-slate-500" : "text-slate-300 dark:text-slate-600"}`}
                >
                  {t(meta.labelKey)}
                </span>
              </button>
            );
          })}
        </div>

        {/* Pipeline fork: Rejected as alternative exit branch */}
        {canReject && (
          <div
            className="mt-2"
            style={{
              marginLeft: `calc(${(Math.max(currentIdx, 0) / (STATUS_PIPELINE.length - 1)) * 100}% - 1rem)`,
            }}
          >
            {/* Vertical drop from pipeline */}
            <div className="w-px h-3 bg-slate-200 dark:bg-slate-700" />
            <div className="flex items-center">
              {/* Horizontal stub */}
              <div className="w-4 h-px bg-slate-200 dark:bg-slate-700 flex-shrink-0" />
              {/* Rejected step node – same style as pipeline steps */}
              <button
                onClick={() => onStatusUpdate(job.id, "REJECTED")}
                className="relative flex flex-col items-center gap-1.5 cursor-pointer group/rej z-10 flex-shrink-0"
                title={t("statusRejected")}
              >
                <div
                  className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm transition-all duration-300
                                ${
                                  job.status === "REJECTED"
                                    ? STATUS_META["REJECTED"].stepActive
                                    : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-300 dark:text-slate-600 group-hover/rej:border-rose-400 dark:group-hover/rej:border-rose-600 group-hover/rej:text-rose-400"
                                }`}
                >
                  <DynamicIcon
                    name={STATUS_META["REJECTED"].icon}
                    className="w-4 h-4"
                  />
                </div>
                <span
                  className={`text-[8px] sm:text-[9px] font-semibold text-center leading-tight transition-colors
                                ${job.status === "REJECTED" ? "text-rose-500 dark:text-rose-400 font-bold" : "text-slate-300 dark:text-slate-600"}`}
                >
                  {t(STATUS_META["REJECTED"].labelKey)}
                </span>
              </button>
              <span className="ml-3 text-[9px] uppercase font-bold text-slate-300 dark:text-slate-600 tracking-widest">
                {t("alternativePath")}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Was jetzt? Guidance */}
      <div className={`rounded-2xl border p-4 shadow-sm ${guidance.bgCls}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div
              className={`w-6 h-6 rounded-lg flex items-center justify-center bg-white dark:bg-slate-900 shadow-sm border border-slate-200 dark:border-slate-800 ${guidance.accentCls}`}
            >
              <DynamicIcon name={statusMeta.icon} className="w-3.5 h-3.5" />
            </div>
            <p
              className={`text-[10px] uppercase font-black tracking-widest ${guidance.accentCls}`}
            >
              {t("guidanceWhatNow")}
            </p>
          </div>
          {job.next_follow_up_at && (
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30 flex items-center gap-1.5 shadow-sm">
              <Clock size={11} className="animate-pulse" />{" "}
              {new Date(job.next_follow_up_at).toLocaleDateString()}
            </span>
          )}
        </div>

        <div className="mb-4">
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100 leading-tight">
            {t(guidance.nextActionKey)}
          </p>
        </div>

        <div className="space-y-2 mb-5">
          {dynamicItems.map((item, i) => {
            const handleRowClick =
              !item.done && (item.tabHint || item.descHint)
                ? () => {
                    if (item.tabHint) {
                      setActiveTab(item.tabHint as TabType);
                      if (item.tabHint === "overview") {
                        setTimeout(() => {
                          window.dispatchEvent(
                            new CustomEvent("showJobDetails", {
                              detail: { jobId: job.id },
                            }),
                          );
                        }, 50);
                      }
                    }
                    if (item.descHint) {
                      window.dispatchEvent(
                        new CustomEvent("showJobDescription", {
                          detail: { jobId: job.id },
                        }),
                      );
                    }
                  }
                : undefined;
            return (
              <div
                key={i}
                onClick={handleRowClick}
                className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all
                                ${
                                  item.done
                                    ? "bg-slate-50/50 dark:bg-slate-800/20 border-slate-100 dark:border-slate-800/50 opacity-60"
                                    : handleRowClick
                                      ? "bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-500/30 shadow-sm cursor-pointer"
                                      : "bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 shadow-sm"
                                }`}
              >
                <div
                  className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-300
                                ${
                                  item.done
                                    ? "bg-emerald-500 border-emerald-500 text-white"
                                    : "bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600"
                                }`}
                >
                  {item.done ? (
                    <Check size={12} strokeWidth={3} />
                  ) : (
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p
                    className={`text-xs font-semibold leading-none ${item.done ? "text-slate-400 dark:text-slate-500 line-through" : "text-slate-600 dark:text-slate-200"}`}
                  >
                    {t(item.textKey)}
                  </p>
                </div>

                {(item.tabHint || item.descHint) && !item.done && (
                  <div className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 pointer-events-none">
                    <ChevronRight size={14} />
                  </div>
                )}
                {item.linkHint === "url" && job.url && !item.done && (
                  <a
                    href={job.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg bg-slate-50 dark:bg-slate-800/50 text-slate-400 hover:text-indigo-500 transition-colors"
                    title="Open job posting"
                  >
                    <ExternalLink size={14} />
                  </a>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-start gap-2 pt-3 border-t border-slate-200/60 dark:border-slate-700/40">
          <span className="text-lg opacity-20 mt-[-4px]">„</span>
          <p className="text-[11px] font-medium italic text-slate-400 dark:text-slate-500 leading-relaxed">
            {t(guidance.nudgeKey)}
          </p>
          <span className="text-lg opacity-20 self-end mb-[-8px]">“</span>
        </div>
      </div>
    </div>
  );
}
