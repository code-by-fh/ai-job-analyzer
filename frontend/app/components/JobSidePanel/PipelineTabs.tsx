import * as LucideIcons from "lucide-react";
import { Check } from "lucide-react";
import { STATUS_PIPELINE, STATUS_META } from "../JobCard/constants";
import { useLanguage } from "../LanguageProvider";
import type { PipelineTabsProps } from "./types";
import type { JobStatus } from "../JobStatusBadge";

const DynamicIcon = ({ name, className }: { name: string; className?: string }) => {
  const IconComponent = (LucideIcons as any)[name];
  if (!IconComponent) return null;
  return <IconComponent className={className} />;
};

export default function PipelineTabs({ currentStatus, onSelect }: PipelineTabsProps) {
  const { t } = useLanguage();
  const currentIndex = STATUS_PIPELINE.indexOf(currentStatus as JobStatus);
  const isExitStatus = currentStatus === "REJECTED" || currentStatus === "FAILED";
  const canReject =
    ["APPLIED", "INTERVIEW", "OFFER"].includes(currentStatus) ||
    currentStatus === "REJECTED";
  const statusMeta = STATUS_META[currentStatus] || STATUS_META["OPEN"];

  return (
    <div className="px-4 pt-3 pb-2 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
      <div className="relative flex items-start justify-between gap-1">
        {/* Background connector line */}
        <div className="absolute top-4 left-4 right-4 h-0.5 bg-slate-200 dark:bg-slate-700" />
        {/* Filled connector up to current step */}
        {!isExitStatus && currentIndex > 0 && (
          <div
            className={`absolute top-4 left-4 h-0.5 transition-all duration-500 ${statusMeta.connectorCls}`}
            style={{
              width: `calc(${(currentIndex / (STATUS_PIPELINE.length - 1)) * 100}% - 2rem)`,
            }}
          />
        )}

        {STATUS_PIPELINE.map((status, index) => {
          const meta = STATUS_META[status];
          const isDone = !isExitStatus && currentIndex > index;
          const isActive = !isExitStatus && currentIndex === index;
          const isFuture = isExitStatus ? true : currentIndex < index;

          return (
            <button
              key={status}
              onClick={() => !isFuture && onSelect(status as JobStatus)}
              disabled={isFuture}
              className="relative flex flex-col items-center gap-1 z-10 flex-1 min-w-0 group/step"
              title={t(meta.labelKey)}
            >
              <div
                className={[
                  "w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm transition-all duration-300",
                  isDone
                    ? meta.stepDone
                    : isActive
                      ? meta.stepActive
                      : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-300 dark:text-slate-600",
                  !isFuture
                    ? "cursor-pointer group-hover/step:scale-110"
                    : "cursor-not-allowed",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {isDone ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <DynamicIcon name={meta.icon} className="w-4 h-4" />
                )}
              </div>
              <span
                className={[
                  "text-[9px] font-semibold text-center leading-tight block w-full truncate px-0.5",
                  isActive
                    ? "text-slate-800 dark:text-slate-100 font-bold"
                    : isDone
                      ? "text-slate-400 dark:text-slate-500"
                      : "text-slate-300 dark:text-slate-600",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {t(meta.labelKey)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Rejected fork — shown when rejection is a realistic exit */}
      {canReject && (
        <div
          className="mt-1.5"
          style={{
            marginLeft: `calc(${(Math.max(currentIndex, 0) / (STATUS_PIPELINE.length - 1)) * 100}% - 1rem)`,
          }}
        >
          <div className="w-px h-3 bg-slate-200 dark:bg-slate-700" />
          <div className="flex items-center">
            <div className="w-4 h-px bg-slate-200 dark:bg-slate-700 flex-shrink-0" />
            <button
              onClick={() => onSelect("REJECTED" as JobStatus)}
              className="relative flex flex-col items-center gap-1 cursor-pointer group/rej z-10 flex-shrink-0"
              title={t(STATUS_META["REJECTED"].labelKey)}
            >
              <div
                className={[
                  "w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm transition-all duration-300",
                  currentStatus === "REJECTED"
                    ? STATUS_META["REJECTED"].stepActive
                    : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-300 dark:text-slate-600 group-hover/rej:border-rose-400 dark:group-hover/rej:border-rose-600 group-hover/rej:text-rose-400",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <DynamicIcon name={STATUS_META["REJECTED"].icon} className="w-4 h-4" />
              </div>
              <span
                className={[
                  "text-[9px] font-semibold text-center leading-tight",
                  currentStatus === "REJECTED"
                    ? "text-rose-500 dark:text-rose-400 font-bold"
                    : "text-slate-300 dark:text-slate-600",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {t(STATUS_META["REJECTED"].labelKey)}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
