import { CheckCircle2 } from "lucide-react";
import { STATUS_PIPELINE, STATUS_META } from "../JobCard/constants";
import { useLanguage } from "../LanguageProvider";
import type { PipelineTabsProps } from "./types";
import type { JobStatus } from "../JobStatusBadge";

export default function PipelineTabs({ currentStatus, onSelect }: PipelineTabsProps) {
  const { t } = useLanguage();
  const currentIndex = STATUS_PIPELINE.indexOf(currentStatus as JobStatus);

  return (
    <div className="border-b border-slate-200 dark:border-slate-800 overflow-x-auto flex-shrink-0">
      <div className="flex min-w-max px-1">
        {STATUS_PIPELINE.map((status, index) => {
          const meta = STATUS_META[status];
          const isDone = index < currentIndex;
          const isActive = index === currentIndex;
          const isFuture = index > currentIndex;

          return (
            <button
              key={status}
              onClick={() => !isFuture && onSelect(status as JobStatus)}
              disabled={isFuture}
              className={[
                "flex items-center gap-2 px-3 py-2.5 border-b-2 text-[11px] font-semibold whitespace-nowrap transition-all",
                isActive
                  ? "border-indigo-500 text-indigo-600 dark:text-indigo-400"
                  : "border-transparent",
                isDone
                  ? "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer"
                  : "",
                isFuture
                  ? "text-slate-400 dark:text-slate-600 opacity-50 cursor-not-allowed"
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {isDone ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
              ) : (
                <span
                  className={[
                    "w-3.5 h-3.5 rounded-full border flex-shrink-0 flex items-center justify-center",
                    isActive
                      ? "border-indigo-500 bg-indigo-500"
                      : "border-slate-300 dark:border-slate-600",
                  ].join(" ")}
                >
                  {isActive && (
                    <span className="w-1.5 h-1.5 rounded-full bg-white" />
                  )}
                </span>
              )}
              <span>{t(meta.labelKey)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
