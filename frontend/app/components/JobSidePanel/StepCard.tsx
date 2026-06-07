import { useState } from "react";
import { Sparkles, Send, Zap, Archive, CheckCircle2, AlertTriangle } from "lucide-react";
import { STATUS_GUIDANCE, STATUS_PIPELINE, STATUS_META } from "../JobCard/constants";
import { useLanguage } from "../LanguageProvider";
import type { JobStatus } from "../JobStatusBadge";
import type { StepCardProps } from "./types";

export default function StepCard({
  job,
  isGenerating,
  onGenerate,
  onStatusUpdate,
  onArchive,
}: StepCardProps) {
  const { t } = useLanguage();
  const [showApplyWarning, setShowApplyWarning] = useState(false);

  const status = (job.status || "OPEN") as JobStatus;
  const guidance = STATUS_GUIDANCE[status];
  const currentIndex = STATUS_PIPELINE.indexOf(status);
  const total = STATUS_PIPELINE.length;
  const nextStatus =
    currentIndex >= 0 && currentIndex < total - 1
      ? STATUS_PIPELINE[currentIndex + 1]
      : null;
  const showErledigt =
    nextStatus !== null && status !== "OPEN" && status !== "OFFER";

  const handleMarkDone = () => {
    if (nextStatus === "APPLIED") {
      const hasCv = !!job.cv_html;
      const hasLetter = !!job.application_draft || !!job.cover_letter_html;
      if (!hasCv || !hasLetter) {
        setShowApplyWarning(true);
        return;
      }
    }
    onStatusUpdate(job.id, nextStatus as JobStatus);
  };

  if (!guidance) return null;

  return (
    <div className={`rounded-xl border p-4 ${guidance.bgCls}`}>
      <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${guidance.accentCls}`}>
        {currentIndex >= 0
          ? `${t("panelStep")} ${currentIndex + 1} ${t("panelOf")} ${total} · ${t(STATUS_META[status].labelKey)}`
          : t(STATUS_META[status]?.labelKey ?? ("statusRejected" as any))}
      </p>
      <p className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-3">
        {t(guidance.nextActionKey)}
      </p>
      <StepActions
        job={job}
        status={status}
        isGenerating={isGenerating}
        onGenerate={onGenerate}
        onStatusUpdate={onStatusUpdate}
        onArchive={onArchive}
      />
      {showErledigt && nextStatus && (
        <button
          onClick={handleMarkDone}
          className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold transition-all active:scale-95 shadow-sm cursor-pointer"
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          {t("markDone")} → {t(STATUS_META[nextStatus].labelKey)} ✓
        </button>
      )}

      {showApplyWarning && nextStatus && (
        <ApplyWithoutDocsModal
          onConfirm={() => {
            setShowApplyWarning(false);
            onStatusUpdate(job.id, nextStatus as JobStatus);
          }}
          onCancel={() => setShowApplyWarning(false)}
        />
      )}
    </div>
  );
}

function ApplyWithoutDocsModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-sm mx-4 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900 dark:text-white">
              {t("applyWithoutDocsTitle")}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              {t("applyWithoutDocsBody")}
            </p>
          </div>
        </div>
        <div className="flex gap-2 justify-end pt-1">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
          >
            {t("cancel")}
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-xs font-bold text-white bg-amber-500 hover:bg-amber-600 rounded-xl transition-all shadow-sm cursor-pointer"
          >
            {t("applyAnyway")}
          </button>
        </div>
      </div>
    </div>
  );
}

// Renders the status-specific primary action buttons inside StepCard.
function StepActions({
  job,
  status,
  isGenerating,
  onGenerate,
  onStatusUpdate,
  onArchive,
}: StepCardProps & { status: JobStatus }) {
  const { t } = useLanguage();

  if (status === "OPEN") {
    return (
      <div className="flex gap-2">
        <button
          onClick={() => onStatusUpdate(job.id, "DRAFTED")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all active:scale-95 shadow-sm cursor-pointer"
        >
          <Send className="w-3.5 h-3.5" />
          {t("apply")}
        </button>
        <button
          onClick={() => onArchive(job.id)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-all active:scale-95 cursor-pointer"
        >
          <Archive className="w-3.5 h-3.5" />
          {t("archiveJob")}
        </button>
      </div>
    );
  }

  if (status === "DRAFTED") {
    if (isGenerating) {
      return (
        <div className="flex items-center gap-2 text-xs text-indigo-600 dark:text-indigo-400 font-semibold">
          <Sparkles className="w-3.5 h-3.5 animate-pulse" />
          {t("generating")}
        </div>
      );
    }
    if (job.application_draft) {
      return (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {t("applicationDraftReady")}
        </p>
      );
    }
    return (
      <button
        onClick={() => onGenerate(job)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white text-xs font-bold transition-all active:scale-95 shadow-sm cursor-pointer"
      >
        <Sparkles className="w-3.5 h-3.5" />
        {t("generateApplication")}
      </button>
    );
  }

  if (status === "INTERVIEW") {
    if (job.interview_prep_material) {
      return (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {t("interviewPrepReady")}
        </p>
      );
    }
    return (
      <button
        onClick={async () => {
          await fetch(
            `${process.env.NEXT_PUBLIC_API_URL}/jobs/${job.id}/interview-prep`,
            { method: "POST", credentials: "include" },
          );
        }}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition-all active:scale-95 shadow-sm cursor-pointer"
      >
        <Zap className="w-3.5 h-3.5" />
        {t("generateInterviewPrep")}
      </button>
    );
  }

  if (status === "OFFER") {
    return (
      <div className="flex gap-2">
        <button
          onClick={() => onStatusUpdate(job.id, "ACCEPTED")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold transition-all active:scale-95 shadow-sm cursor-pointer"
        >
          {t("acceptOffer")}
        </button>
        <button
          onClick={() => onStatusUpdate(job.id, "REJECTED")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-bold hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all active:scale-95 cursor-pointer"
        >
          {t("decline")}
        </button>
      </div>
    );
  }

  if (status === "ACCEPTED") {
    return (
      <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
        {t("jobAcceptedCongrats")}
      </p>
    );
  }

  // APPLIED, REJECTED, FAILED: informational nudge only
  const currentGuidance = STATUS_GUIDANCE[status];
  return (
    <p className="text-xs text-slate-500 dark:text-slate-400">
      {currentGuidance ? t(currentGuidance.nudgeKey) : ""}
    </p>
  );
}
