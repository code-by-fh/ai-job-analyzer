import { Sparkles, Send, Zap, Archive } from "lucide-react";
import { STATUS_GUIDANCE } from "../JobCard/constants";
import type { JobStatus } from "../JobStatusBadge";
import type { StepCardProps } from "./types";

export default function StepCard({
  job,
  isGenerating,
  onGenerate,
  onStatusUpdate,
  onArchive,
}: StepCardProps) {
  const status = (job.status || "OPEN") as JobStatus;
  const guidance = STATUS_GUIDANCE[status];

  if (!guidance) return null;

  return (
    <div className={`rounded-xl border p-4 ${guidance.bgCls}`}>
      <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${guidance.accentCls}`}>
        Aktueller Schritt
      </p>
      <p className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-3">
        {guidance.nextAction}
      </p>
      <StepActions
        job={job}
        status={status}
        isGenerating={isGenerating}
        onGenerate={onGenerate}
        onStatusUpdate={onStatusUpdate}
        onArchive={onArchive}
      />
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
  if (status === "OPEN") {
    return (
      <div className="flex gap-2">
        <button
          onClick={() => onStatusUpdate(job.id, "DRAFTED")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all active:scale-95 shadow-sm"
        >
          <Send className="w-3.5 h-3.5" />
          Bewerben
        </button>
        <button
          onClick={() => onArchive(job.id)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-all active:scale-95"
        >
          <Archive className="w-3.5 h-3.5" />
          Archivieren
        </button>
      </div>
    );
  }

  if (status === "DRAFTED") {
    if (isGenerating) {
      return (
        <div className="flex items-center gap-2 text-xs text-indigo-600 dark:text-indigo-400 font-semibold">
          <Sparkles className="w-3.5 h-3.5 animate-pulse" />
          Wird generiert…
        </div>
      );
    }
    if (job.application_draft) {
      return (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Dokumente bereit — prüfe den Inhalt im Tab "Bewerbung".
        </p>
      );
    }
    return (
      <button
        onClick={() => onGenerate(job)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white text-xs font-bold transition-all active:scale-95 shadow-sm"
      >
        <Sparkles className="w-3.5 h-3.5" />
        CV & Anschreiben generieren
      </button>
    );
  }

  if (status === "INTERVIEW") {
    if (job.interview_prep_material) {
      return (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Vorbereitung bereit — siehe Tab "Interview".
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
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition-all active:scale-95 shadow-sm"
      >
        <Zap className="w-3.5 h-3.5" />
        Interview Prep generieren
      </button>
    );
  }

  if (status === "OFFER") {
    return (
      <div className="flex gap-2">
        <button
          onClick={() => onStatusUpdate(job.id, "ACCEPTED")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold transition-all active:scale-95 shadow-sm"
        >
          Angebot annehmen
        </button>
        <button
          onClick={() => onStatusUpdate(job.id, "REJECTED")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-bold hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all active:scale-95"
        >
          Ablehnen
        </button>
      </div>
    );
  }

  if (status === "ACCEPTED") {
    return (
      <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
        🎉 Glückwunsch! Der Job ist deiner.
      </p>
    );
  }

  // APPLIED, REJECTED, FAILED: informational only, footer handles advancement
  return (
    <p className="text-xs text-slate-500 dark:text-slate-400">
      {STATUS_GUIDANCE[status]?.nudge}
    </p>
  );
}
