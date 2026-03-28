"use client";
import { X, CheckCircle2 } from "lucide-react";

interface SuccessBannerProps {
  detail: string;
  onDismiss: () => void;
}

export default function SuccessBanner({
  detail,
  onDismiss,
}: SuccessBannerProps) {
  return (
    <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-xl px-4 py-3 flex items-start gap-3 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
      <CheckCircle2 className="w-5 h-5 text-emerald-500 dark:text-emerald-400 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
          {detail}
        </p>
      </div>
      <button
        onClick={onDismiss}
        aria-label="Close"
        className="shrink-0 text-emerald-400 hover:text-emerald-600 dark:text-emerald-500 dark:hover:text-emerald-300 transition-colors cursor-pointer"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
