import React from "react";
import { X } from "lucide-react";

const formatElapsed = (s: number) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

interface RegenBannerProps {
  label: string;
  icon: React.ReactNode;
  elapsed: number;
  onCancel: () => void;
  /** Optional phase step indicators (e.g. for application draft generation) */
  phaseCount?: number;
  phaseIndex?: number;
}

export default function RegenBanner({
  label,
  icon,
  elapsed,
  onCancel,
  phaseCount,
  phaseIndex,
}: RegenBannerProps) {
  const showPhases = phaseCount !== undefined && phaseIndex !== undefined;

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 rounded-xl">
      <div className="flex items-center gap-3 min-w-0">
        <div className="relative w-7 h-7 flex-shrink-0 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full border-2 border-indigo-200 dark:border-indigo-500/30" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-indigo-500 animate-spin" />
          <span className="text-xs leading-none">{icon}</span>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold text-indigo-700 dark:text-indigo-300 truncate">
            {label}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            {showPhases && (
              <div className="flex gap-0.5">
                {Array.from({ length: phaseCount! }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-1 rounded-full transition-all duration-500 ${
                      i === phaseIndex
                        ? "w-4 bg-indigo-500"
                        : i < phaseIndex!
                          ? "w-1 bg-indigo-300 dark:bg-indigo-600"
                          : "w-1 bg-indigo-100 dark:bg-indigo-500/20"
                    }`}
                  />
                ))}
              </div>
            )}
            <span className="text-[10px] text-indigo-400 dark:text-indigo-500 tabular-nums">
              {formatElapsed(elapsed)}
            </span>
          </div>
        </div>
      </div>
      <button
        onClick={onCancel}
        className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 rounded-lg transition-all cursor-pointer whitespace-nowrap"
      >
        <X className="w-3 h-3" />
        Abbrechen
      </button>
    </div>
  );
}
