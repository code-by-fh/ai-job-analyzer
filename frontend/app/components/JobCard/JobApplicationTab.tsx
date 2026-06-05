"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";

const DocumentEditor = dynamic(
  () => import("../editor/DocumentEditor"),
  { ssr: false }
);
import {
  Check,
  Copy,
  Download,
  FileText,
  Loader2,
  Edit2,
  X,
  Save,
  RefreshCw,
  Zap,
  User,
  RotateCw,
} from "lucide-react";
import RegenBanner from "./RegenBanner";
import { useLanguage } from "../LanguageProvider";
import type { Job } from "../../lib/types";
import type { JobStatus } from "../JobStatusBadge";
import { fetchWithAuth } from "../AuthProvider";

interface JobDocument {
  id: number;
  original_filename: string;
  file_size: number | null;
  mime_type: string | null;
  kind: string;
  uploaded_at: string | null;
}

interface JobApplicationTabProps {
  job: Job;
  isGenerating: boolean;
  onGenerate: (job: Job) => void;
  onRegenerate?: (job: Job, notes: string) => Promise<void>;
  onCancelGenerate?: (jobId: string) => Promise<void>;
  onStatusUpdate: (jobId: string, status: JobStatus) => void;
  onUpdateJob?: (jobId: string, payload: Partial<Job>) => Promise<void>;
  apiBase: string;
}

type ActiveView = "letter" | "cv";

const formatElapsed = (s: number) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

const GENERATION_PHASES = [
  { label: "Stellenanzeige analysieren…", icon: "🔍" },
  { label: "Profil abgleichen…", icon: "📋" },
  { label: "Stärken herausarbeiten…", icon: "💡" },
  { label: "Einleitung formulieren…", icon: "✍️" },
  { label: "Mehrwert herausarbeiten…", icon: "🎯" },
  { label: "Abschluss verfassen…", icon: "✅" },
];

const CV_PHASES = [
  { label: "Profil laden…", icon: "📂" },
  { label: "Stellenanforderungen prüfen…", icon: "🔍" },
  { label: "Erfahrungen priorisieren…", icon: "⭐" },
  { label: "Lebenslauf optimieren…", icon: "✍️" },
  { label: "PDF erstellen…", icon: "📄" },
];

export default function JobApplicationTab({
  job,
  isGenerating,
  onGenerate,
  onRegenerate,
  onCancelGenerate,
  onStatusUpdate,
  onUpdateJob,
  apiBase,
}: JobApplicationTabProps) {
  const { t } = useLanguage();

  // ── View toggle ───────────────────────────────────────────────────────────
  const [activeView, setActiveView] = useState<ActiveView>("letter");

  // ── Anschreiben state ─────────────────────────────────────────────────────
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draftContent, setDraftContent] = useState(job.application_draft || "");
  const [isSaving, setIsSaving] = useState(false);
  const [showRegenInput, setShowRegenInput] = useState(false);
  const [regenNote, setRegenNote] = useState("");
  const [isSubmittingRegen, setIsSubmittingRegen] = useState(false);

  // ── Anschreiben timer / phases ────────────────────────────────────────────
  const [elapsed, setElapsed] = useState(0);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const phaseRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Lebenslauf state ──────────────────────────────────────────────────────
  const [cvDoc, setCvDoc] = useState<JobDocument | null>(null);
  const [cvLoading, setCvLoading] = useState(true);
  const [cvBlobUrl, setCvBlobUrl] = useState<string | null>(null);
  const [cvBlobLoading, setCvBlobLoading] = useState(false);
  const [cvGenerating, setCvGenerating] = useState(
    () => job.status === "GENERATING" && !!localStorage.getItem(`gen_cv_${job.id}`)
  );

  // ── Letter document state ─────────────────────────────────────────────────
  const [letterDoc, setLetterDoc] = useState<JobDocument | null>(null);
  const [letterDocLoading, setLetterDocLoading] = useState(false);
  const [letterBlobUrl, setLetterBlobUrl] = useState<string | null>(null);
  const [letterBlobLoading, setLetterBlobLoading] = useState(false);

  const [cvElapsed, setCvElapsed] = useState(0);
  const [cvPhaseIndex, setCvPhaseIndex] = useState(0);
  const cvTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cvPhaseRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cvGenerationPending = useRef(
    job.status === "GENERATING" && !!localStorage.getItem(`gen_cv_${job.id}`)
  );

  // isGenerating fires for both letter and CV package generation (job.status === "GENERATING").
  // isLetterGenerating is only true when the letter is generating, not the CV.
  const isLetterGenerating = isGenerating && !cvGenerationPending.current;
  const letterGeneratingPrevRef = useRef(isLetterGenerating);

  const [isCvEditing, setIsCvEditing] = useState(false);
  const [cvDraftContent, setCvDraftContent] = useState(job.cv_draft || "");
  const [isCvSaving, setIsCvSaving] = useState(false);

  // ── Document editor ───────────────────────────────────────────────────────
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorKind, setEditorKind] = useState<"cv" | "cover_letter">("cv");
  const [editorHtml, setEditorHtml] = useState("");

  // ── Anschreiben timer ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!isLetterGenerating) {
      if (timerRef.current) clearInterval(timerRef.current);
      if (phaseRef.current) clearInterval(phaseRef.current);
      setElapsed(0);
      setPhaseIndex(0);
      return;
    }
    const stored = localStorage.getItem(`gen_app_${job.id}`);
    const startTime = stored ? parseInt(stored) : Date.now();
    if (!stored) localStorage.setItem(`gen_app_${job.id}`, startTime.toString());
    setElapsed(Math.floor((Date.now() - startTime) / 1000));
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    phaseRef.current = setInterval(() => {
      setPhaseIndex((i) => (i + 1) % GENERATION_PHASES.length);
    }, 3500);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (phaseRef.current) clearInterval(phaseRef.current);
    };
  }, [isLetterGenerating, job.id]);

  useEffect(() => {
    if (!isLetterGenerating && job.application_draft) {
      localStorage.removeItem(`gen_app_${job.id}`);
    }
  }, [isLetterGenerating, job.application_draft, job.id]);

  // Reload letter doc when letter generation completes (true → false transition only)
  useEffect(() => {
    if (letterGeneratingPrevRef.current && !isLetterGenerating && job.application_draft) {
      loadLetterDocument();
    }
    letterGeneratingPrevRef.current = isLetterGenerating;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLetterGenerating]);

  // ── CV timer ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!cvGenerating) {
      if (cvTimerRef.current) clearInterval(cvTimerRef.current);
      if (cvPhaseRef.current) clearInterval(cvPhaseRef.current);
      setCvElapsed(0);
      setCvPhaseIndex(0);
      return;
    }
    const start = Date.now();
    cvTimerRef.current = setInterval(() => {
      setCvElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    cvPhaseRef.current = setInterval(() => {
      setCvPhaseIndex((i) => (i + 1) % CV_PHASES.length);
    }, 3000);
    return () => {
      if (cvTimerRef.current) clearInterval(cvTimerRef.current);
      if (cvPhaseRef.current) clearInterval(cvPhaseRef.current);
    };
  }, [cvGenerating]);

  // Clear cvGenerating when job leaves GENERATING state
  useEffect(() => {
    if (job.status !== "GENERATING" && cvGenerationPending.current) {
      cvGenerationPending.current = false;
      setCvGenerating(false);
      localStorage.removeItem(`gen_cv_${job.id}`);
      loadCvDocument();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.status]);

  // Sync cv_draft from job prop
  useEffect(() => {
    if (!isCvEditing) {
      setCvDraftContent(job.cv_draft || "");
    }
  }, [job.cv_draft, isCvEditing]);

  // ── Fetch CV document ─────────────────────────────────────────────────────
  const loadCvDocument = useCallback(async () => {
    setCvLoading(true);
    try {
      const res = await fetchWithAuth(`${apiBase}/jobs/${job.id}/documents`);
      if (res.ok) {
        const docs: JobDocument[] = await res.json();
        setCvDoc(docs.find((d) => d.kind === "GENERATED_CV") ?? null);
      }
    } finally {
      setCvLoading(false);
    }
  }, [apiBase, job.id]);

  useEffect(() => {
    loadCvDocument();
  }, [loadCvDocument]);

  const loadLetterDocument = useCallback(async () => {
    setLetterDocLoading(true);
    try {
      const res = await fetchWithAuth(`${apiBase}/jobs/${job.id}/documents`);
      if (res.ok) {
        const docs: JobDocument[] = await res.json();
        setLetterDoc(docs.find((d) => d.kind === "GENERATED_LETTER") ?? null);
      }
    } finally {
      setLetterDocLoading(false);
    }
  }, [apiBase, job.id]);

  useEffect(() => {
    loadLetterDocument();
  }, [loadLetterDocument]);

  // ── CV blob for inline iframe ─────────────────────────────────────────────
  useEffect(() => {
    if (!cvDoc) { setCvBlobUrl(null); return; }
    let objectUrl: string | null = null;
    setCvBlobLoading(true);
    setCvBlobUrl(null);
    fetchWithAuth(`${apiBase}/jobs/${job.id}/documents/${cvDoc.id}/view`)
      .then(async (res) => {
        if (!res.ok) return;
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        setCvBlobUrl(objectUrl);
      })
      .catch(() => {})
      .finally(() => setCvBlobLoading(false));
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [cvDoc, apiBase, job.id]);

  // ── Letter blob for inline iframe ─────────────────────────────────────────
  useEffect(() => {
    if (!letterDoc) { setLetterBlobUrl(null); return; }
    let objectUrl: string | null = null;
    setLetterBlobLoading(true);
    setLetterBlobUrl(null);
    fetchWithAuth(`${apiBase}/jobs/${job.id}/documents/${letterDoc.id}/view`)
      .then(async (res) => {
        if (!res.ok) return;
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        setLetterBlobUrl(objectUrl);
      })
      .catch(() => {})
      .finally(() => setLetterBlobLoading(false));
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [letterDoc, apiBase, job.id]);

  // ── Actions: Anschreiben ──────────────────────────────────────────────────
  const handleCopy = () => {
    if (!job.application_draft) return;
    navigator.clipboard.writeText(job.application_draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadLetter = async () => {
    try {
      const baseUrl = apiBase.endsWith("/") ? apiBase.slice(0, -1) : apiBase;
      const res = await fetchWithAuth(
        `${baseUrl}/jobs/${encodeURIComponent(job.id)}/download`,
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Download failed");
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Bewerbung_${job.company.replace(/\s+/g, "_")}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      if (job.status === "OPEN" || job.status === "DRAFTED" || !job.status) {
        onStatusUpdate(job.id, "APPLIED");
      }
    } catch (e: any) {
      alert(t("downloadFailed") + ": " + (e.message || "Unknown error"));
    }
  };

  const handleEditStart = () => {
    setDraftContent(job.application_draft || "");
    setIsEditing(true);
    setShowRegenInput(false);
  };

  const handleEditCancel = () => {
    setDraftContent(job.application_draft || "");
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!onUpdateJob) return;
    setIsSaving(true);
    try {
      await onUpdateJob(job.id, { application_draft: draftContent });
      setIsEditing(false);
    } catch (e) {
      console.error("Save error:", e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRegenerate = async () => {
    if (isSubmittingRegen || isLetterGenerating) return;
    setIsSubmittingRegen(true);
    setShowRegenInput(false);
    localStorage.setItem(`gen_app_${job.id}`, Date.now().toString());
    try {
      if (onRegenerate) {
        await onRegenerate(job, regenNote);
      } else {
        const baseUrl = apiBase.endsWith("/") ? apiBase.slice(0, -1) : apiBase;
        await fetchWithAuth(`${baseUrl}/jobs/${job.id}/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ improvement_notes: regenNote || null }),
        });
      }
      setRegenNote("");
    } catch (e) {
      localStorage.removeItem(`gen_app_${job.id}`);
      console.error("Regenerate error:", e);
    } finally {
      setIsSubmittingRegen(false);
    }
  };

  const handleCancel = async () => {
    if (onCancelGenerate) {
      await onCancelGenerate(job.id);
    } else {
      try {
        const baseUrl = apiBase.endsWith("/") ? apiBase.slice(0, -1) : apiBase;
        await fetchWithAuth(`${baseUrl}/jobs/${job.id}/cancel-generation`, {
          method: "POST",
        });
      } catch {}
    }
    localStorage.removeItem(`gen_app_${job.id}`);
  };

  // ── Actions: Lebenslauf ───────────────────────────────────────────────────
  const handleDownloadCv = () => {
    if (!cvDoc) return;
    const a = document.createElement("a");
    a.href = `${apiBase}/jobs/${job.id}/documents/${cvDoc.id}/download`;
    a.download = cvDoc.original_filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleDownloadLetterDoc = async () => {
    if (!letterDoc) return;
    try {
      const res = await fetchWithAuth(
        `${apiBase}/jobs/${job.id}/documents/${letterDoc.id}/download`
      );
      if (!res.ok) return;
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = letterDoc.original_filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {}
  };

  const openEditor = useCallback(
    async (kind: "cv" | "cover_letter") => {
      const res = await fetchWithAuth(
        `${apiBase}/jobs/${job.id}/documents/html?kind=${kind}`
      );
      if (!res.ok) return;
      const data = await res.json();
      setEditorHtml(data.html || "");
      setEditorKind(kind);
      setEditorOpen(true);
    },
    [job.id, apiBase]
  );

  const handleRegenCv = async () => {
    cvGenerationPending.current = true;
    localStorage.setItem(`gen_cv_${job.id}`, Date.now().toString());
    setCvGenerating(true);
    try {
      const baseUrl = apiBase.endsWith("/") ? apiBase.slice(0, -1) : apiBase;
      const res = await fetchWithAuth(
        `${baseUrl}/jobs/${encodeURIComponent(job.id)}/generate-package`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ include_profile_documents: false }),
        },
      );
      if (!res.ok) {
        cvGenerationPending.current = false;
        localStorage.removeItem(`gen_cv_${job.id}`);
        setCvGenerating(false);
        alert(`Lebenslauf konnte nicht erstellt werden (HTTP ${res.status})`);
      }
      // stays true until job.status !== "GENERATING"
    } catch (e) {
      cvGenerationPending.current = false;
      localStorage.removeItem(`gen_cv_${job.id}`);
      setCvGenerating(false);
      console.error("Generate CV error:", e);
    }
  };

  const handleCvEditStart = () => {
    setCvDraftContent(job.cv_draft || "");
    setIsCvEditing(true);
  };

  const handleCvEditCancel = () => {
    setCvDraftContent(job.cv_draft || "");
    setIsCvEditing(false);
  };

  const handleCvSave = async () => {
    if (!onUpdateJob) return;
    setIsCvSaving(true);
    try {
      await onUpdateJob(job.id, { cv_draft: cvDraftContent });
      setIsCvEditing(false);
    } catch (e) {
      console.error("CV save error:", e);
    } finally {
      setIsCvSaving(false);
    }
  };

  const phase = GENERATION_PHASES[phaseIndex];
  const cvPhase = CV_PHASES[cvPhaseIndex];

  return (
    <>
    <div className="space-y-4 flex-1 flex flex-col">

      {/* ── SEGMENTED TOGGLE ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/50 self-start">
        <button
          onClick={() => setActiveView("letter")}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeView === "letter"
              ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm border border-slate-200/80 dark:border-slate-600"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          Anschreiben
          {isLetterGenerating && (
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
          )}
        </button>
        <button
          onClick={() => setActiveView("cv")}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeView === "cv"
              ? "bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm border border-slate-200/80 dark:border-slate-600"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          }`}
        >
          <User className="w-3.5 h-3.5" />
          Lebenslauf
          {cvGenerating && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          )}
        </button>
      </div>

      {/* ── ANSCHREIBEN VIEW ─────────────────────────────────────────────────── */}
      {activeView === "letter" && (
        <div className="space-y-3 flex-1 flex flex-col">

          {/* Action bar */}
          <div className="flex flex-wrap items-center gap-2 bg-slate-50 dark:bg-slate-900/50 px-3 py-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
              {!isEditing && !isLetterGenerating && (
                <button
                  onClick={() => {
                    if (job.application_draft) {
                      setShowRegenInput((v) => !v);
                    } else {
                      onGenerate(job);
                    }
                  }}
                  disabled={isSubmittingRegen}
                  className={`p-2 rounded-lg transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer whitespace-nowrap disabled:opacity-40 ${
                    showRegenInput
                      ? "text-purple-600 bg-purple-100 dark:bg-purple-500/20"
                      : "text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10"
                  }`}
                >
                  {isSubmittingRegen ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  <span className="hidden sm:inline">
                    {job.application_draft ? "Neu generieren" : "Generieren"}
                  </span>
                </button>
              )}
              {!isEditing && job.application_draft && !isLetterGenerating && (
                <button
                  onClick={handleEditStart}
                  className="p-2 text-slate-500 hover:text-indigo-500 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer whitespace-nowrap"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Bearbeiten</span>
                </button>
              )}
              {isEditing && (
                <>
                  <button
                    onClick={handleEditCancel}
                    disabled={isSaving}
                    className="p-2 text-slate-500 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer whitespace-nowrap disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Abbrechen</span>
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="p-2 text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer shadow-sm shadow-emerald-500/20 whitespace-nowrap disabled:opacity-50"
                  >
                    {isSaving ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    <span className="hidden sm:inline">Speichern</span>
                  </button>
                </>
              )}
              {!isEditing && job.application_draft && !isLetterGenerating && (
                <>
                  <button
                    onClick={handleCopy}
                    className="p-2 text-slate-500 hover:text-indigo-500 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer whitespace-nowrap"
                  >
                    {copied ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span className="hidden sm:inline">
                      {copied ? "Kopiert" : "Kopieren"}
                    </span>
                  </button>
                  <button
                    onClick={letterDoc ? handleDownloadLetterDoc : handleDownloadLetter}
                    className="p-2 text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer shadow-sm shadow-indigo-500/20 whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>PDF</span>
                  </button>
                  {job.cover_letter_html && (
                    <button
                      onClick={() => openEditor("cover_letter")}
                      className="p-2 text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer shadow-sm whitespace-nowrap"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>Editor</span>
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Regen input — only when toggled */}
          {showRegenInput && !isEditing && (
            <div className="bg-purple-50 dark:bg-purple-500/5 border border-purple-200 dark:border-purple-500/20 rounded-xl p-4 space-y-3">
              <p className="text-[10px] font-black text-purple-700 dark:text-purple-300 uppercase tracking-widest">
                Verbesserungshinweis
              </p>
              <textarea
                value={regenNote}
                onChange={(e) => setRegenNote(e.target.value)}
                placeholder="Z.B. 'Mehr auf meine Python-Erfahrung eingehen' oder 'Formeller schreiben'"
                rows={3}
                className="w-full text-sm bg-white dark:bg-slate-800 border border-purple-200 dark:border-purple-500/30 rounded-lg p-3 text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-400 resize-y"
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => { setShowRegenInput(false); setRegenNote(""); }}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-all cursor-pointer"
                >
                  Abbrechen
                </button>
                <button
                  onClick={handleRegenerate}
                  disabled={isSubmittingRegen}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-purple-600 hover:bg-purple-500 rounded-lg transition-all shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingRegen ? (
                    <><Loader2 className="w-3 h-3 animate-spin" /> Wird gestartet…</>
                  ) : (
                    <><RefreshCw className="w-3 h-3" /> Neu generieren</>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Content */}
          {isLetterGenerating && !job.application_draft ? (
            <GeneratingSpinner
              phases={GENERATION_PHASES}
              phase={phase}
              elapsed={elapsed}
              phaseIndex={phaseIndex}
              onCancel={handleCancel}
            />
          ) : (
            <>
              {isLetterGenerating && (
                <RegenBanner
                  label={phase.label}
                  icon={phase.icon}
                  elapsed={elapsed}
                  onCancel={handleCancel}
                  phaseCount={GENERATION_PHASES.length}
                  phaseIndex={phaseIndex}
                />
              )}
              {isEditing ? (
                <div className="bg-white dark:bg-slate-800 p-4 md:p-6 rounded-2xl border-2 border-indigo-200 dark:border-indigo-500/30 shadow-lg">
                  <textarea
                    value={draftContent}
                    onChange={(e) => setDraftContent(e.target.value)}
                    className="w-full min-h-[500px] bg-transparent border-0 focus:ring-0 p-0 text-slate-700 dark:text-slate-200 font-serif leading-relaxed text-sm md:text-base resize-y"
                    placeholder="Bewerbungsschreiben hier bearbeiten..."
                  />
                </div>
              ) : job.application_draft ? (
                letterDocLoading ? (
                  <div className="flex items-center justify-center py-16 gap-3 text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
                    <span className="text-xs font-semibold">Lade Anschreiben…</span>
                  </div>
                ) : letterDoc ? (
                  <div className={`bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-lg overflow-hidden transition-opacity duration-300 ${isLetterGenerating ? "opacity-40 pointer-events-none select-none" : ""}`}>
                    {letterBlobLoading ? (
                      <div className="flex items-center justify-center py-16">
                        <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
                      </div>
                    ) : letterBlobUrl ? (
                      <iframe
                        src={letterBlobUrl}
                        className="w-full border-0"
                        style={{ height: "680px" }}
                        title="Anschreiben PDF"
                      />
                    ) : null}
                  </div>
                ) : (
                  <div
                    className={`bg-white dark:bg-slate-800 p-8 md:p-10 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-lg font-serif transition-opacity duration-300 ${isLetterGenerating ? "opacity-40 pointer-events-none select-none" : ""}`}
                  >
                    <div className="prose prose-sm md:prose-base dark:prose-invert max-w-none prose-p:text-slate-700 dark:prose-p:text-slate-200 prose-headings:text-slate-900 dark:prose-headings:text-white leading-relaxed">
                      <ReactMarkdown>{job.application_draft}</ReactMarkdown>
                    </div>
                  </div>
                )
              ) : (
                <div className="group flex flex-col items-center justify-center py-12 gap-4 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-900/20 hover:border-indigo-300 dark:hover:border-indigo-500/40 transition-all">
                  <div className="w-12 h-12 bg-white dark:bg-slate-800 rounded-xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                    <FileText className="w-6 h-6 text-indigo-500" />
                  </div>
                  <div className="text-center px-6 max-w-xs space-y-1">
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                      Noch kein Anschreiben
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      KI-generiert und auf dein Profil abgestimmt.
                    </p>
                  </div>
                  <button
                    onClick={() => onGenerate(job)}
                    disabled={isLetterGenerating}
                    className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-500/20 transition-all hover:-translate-y-0.5 cursor-pointer disabled:opacity-50"
                  >
                    {t("generateApplication") || "Bewerbung generieren"}
                    <Zap className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── LEBENSLAUF VIEW ──────────────────────────────────────────────────── */}
      {activeView === "cv" && (
        <div className="space-y-3 flex-1 flex flex-col">

          {/* Action bar */}
          <div className="flex flex-wrap items-center gap-2 bg-slate-50 dark:bg-slate-900/50 px-3 py-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
              <button
                onClick={loadCvDocument}
                disabled={cvLoading}
                className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-all cursor-pointer"
                title="Aktualisieren"
              >
                <RotateCw className={`w-3.5 h-3.5 ${cvLoading ? "animate-spin" : ""}`} />
              </button>
              {!isCvEditing && (
                <button
                  onClick={handleRegenCv}
                  disabled={cvGenerating || isLetterGenerating}
                  className="p-2 rounded-lg transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer whitespace-nowrap text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 disabled:opacity-40"
                >
                  {cvGenerating ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  <span className="hidden sm:inline">
                    {job.cv_draft ? "Neu generieren" : "Generieren"}
                  </span>
                </button>
              )}
              {!isCvEditing && job.cv_draft && !cvGenerating && (
                <button
                  onClick={handleCvEditStart}
                  className="p-2 text-slate-500 hover:text-emerald-500 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer whitespace-nowrap"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Bearbeiten</span>
                </button>
              )}
              {isCvEditing && (
                <>
                  <button
                    onClick={handleCvEditCancel}
                    disabled={isCvSaving}
                    className="p-2 text-slate-500 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer whitespace-nowrap disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Abbrechen</span>
                  </button>
                  <button
                    onClick={handleCvSave}
                    disabled={isCvSaving}
                    className="p-2 text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer shadow-sm shadow-emerald-500/20 whitespace-nowrap disabled:opacity-50"
                  >
                    {isCvSaving ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    <span className="hidden sm:inline">Speichern</span>
                  </button>
                </>
              )}
              {!isCvEditing && cvDoc && !cvGenerating && (
                <button
                  onClick={handleDownloadCv}
                  className="p-2 text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer shadow-sm shadow-emerald-500/20 whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>PDF</span>
                </button>
              )}
              {!isCvEditing && !cvGenerating && job.cv_html && (
                <button
                  onClick={() => openEditor("cv")}
                  className="p-2 text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer shadow-sm whitespace-nowrap"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Editor</span>
                </button>
              )}
              {!isCvEditing && !cvGenerating && job.cover_letter_html && (
                <button
                  onClick={() => openEditor("cover_letter")}
                  className="p-2 text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer shadow-sm whitespace-nowrap"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Anschreiben</span>
                </button>
              )}
            </div>
          </div>

          {/* Content */}
          {cvGenerating ? (
            <GeneratingSpinner
              phases={CV_PHASES}
              phase={cvPhase}
              elapsed={cvElapsed}
              phaseIndex={cvPhaseIndex}
              accentClass="emerald"
            />
          ) : cvLoading ? (
            <div className="flex items-center justify-center py-16 gap-3 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
              <span className="text-xs font-semibold">Lade Lebenslauf…</span>
            </div>
          ) : isCvEditing ? (
            <div className="bg-white dark:bg-slate-800 p-4 md:p-6 rounded-2xl border-2 border-emerald-200 dark:border-emerald-500/30 shadow-lg">
              <textarea
                value={cvDraftContent}
                onChange={(e) => setCvDraftContent(e.target.value)}
                className="w-full min-h-[500px] bg-transparent border-0 focus:ring-0 p-0 text-slate-700 dark:text-slate-200 font-mono leading-relaxed text-sm resize-y"
                placeholder="Lebenslauf hier bearbeiten (Markdown)…"
              />
            </div>
          ) : job.cv_draft ? (
            <div className="bg-white dark:bg-slate-800 p-8 md:p-10 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-lg">
              <div className="prose prose-sm md:prose-base dark:prose-invert max-w-none prose-p:text-slate-700 dark:prose-p:text-slate-200 prose-headings:text-slate-900 dark:prose-headings:text-white leading-relaxed">
                <ReactMarkdown>{job.cv_draft}</ReactMarkdown>
              </div>
              {cvDoc && (cvBlobUrl || cvBlobLoading) && (
                <details className="mt-8">
                  <summary className="text-xs font-bold text-slate-400 dark:text-slate-500 cursor-pointer hover:text-slate-600 dark:hover:text-slate-300 uppercase tracking-widest select-none">
                    PDF-Vorschau
                  </summary>
                  <div className="mt-4 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-900">
                    {cvBlobLoading ? (
                      <div className="flex items-center justify-center py-10">
                        <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
                      </div>
                    ) : (
                      <iframe
                        src={cvBlobUrl!}
                        className="w-full border-0"
                        style={{ height: "680px" }}
                        title="Lebenslauf PDF"
                      />
                    )}
                  </div>
                </details>
              )}
            </div>
          ) : (
            <div className="group flex flex-col items-center justify-center py-16 gap-4 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-900/20 hover:border-emerald-300 dark:hover:border-emerald-500/40 transition-all">
              <div className="w-12 h-12 bg-white dark:bg-slate-800 rounded-xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                <User className="w-6 h-6 text-emerald-500" />
              </div>
              <div className="text-center px-6 max-w-xs space-y-1">
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                  Noch kein Lebenslauf
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  KI-optimiert auf Basis deines Profils und der Stellenanzeige.
                </p>
              </div>
              <button
                onClick={handleRegenCv}
                disabled={cvGenerating}
                className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-500/20 transition-all hover:-translate-y-0.5 cursor-pointer disabled:opacity-50"
              >
                Lebenslauf generieren
                <Zap className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>

    {editorOpen && (
      <DocumentEditor
        jobId={job.id}
        kind={editorKind}
        initialHtml={editorHtml}
        apiBase={apiBase}
        onClose={() => setEditorOpen(false)}
      />
    )}
    </>
  );
}

// ── Spinner sub-component ──────────────────────────────────────────────────────
function GeneratingSpinner({
  phases,
  phase,
  elapsed,
  phaseIndex,
  onCancel,
  accentClass = "indigo",
}: {
  phases: { label: string; icon: string }[];
  phase: { label: string; icon: string };
  elapsed: number;
  phaseIndex: number;
  onCancel?: () => void;
  accentClass?: "indigo" | "emerald";
}) {
  const accent = accentClass === "emerald"
    ? { ring: "border-t-emerald-500", bg: "border-emerald-100 dark:border-emerald-500/20", dot_active: "bg-emerald-500", dot_done: "bg-emerald-300 dark:bg-emerald-600", border: "border-emerald-200 dark:border-emerald-500/30", fill: "bg-emerald-50/30 dark:bg-emerald-500/5" }
    : { ring: "border-t-indigo-500", bg: "border-indigo-100 dark:border-indigo-500/20", dot_active: "bg-indigo-500", dot_done: "bg-indigo-300 dark:bg-indigo-600", border: "border-indigo-200 dark:border-indigo-500/30", fill: "bg-indigo-50/30 dark:bg-indigo-500/5" };

  return (
    <div className={`flex-1 flex flex-col items-center justify-center py-14 gap-6 border-2 border-dashed ${accent.border} rounded-3xl ${accent.fill}`}>
      <div className="relative w-20 h-20 flex items-center justify-center">
        <div className={`absolute inset-0 rounded-full border-4 ${accent.bg}`} />
        <div className={`absolute inset-0 rounded-full border-4 border-transparent ${accent.ring} animate-spin`} />
        <span className="text-2xl">{phase.icon}</span>
      </div>
      <div className="text-center space-y-1">
        <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
          {phase.label}
        </p>
        <p className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">
          {formatElapsed(elapsed)}
        </p>
      </div>
      <div className="flex gap-1.5">
        {phases.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-all duration-500 ${
              i === phaseIndex
                ? `w-6 ${accent.dot_active}`
                : i < phaseIndex
                  ? `w-1.5 ${accent.dot_done}`
                  : "w-1.5 bg-slate-200 dark:bg-slate-700"
            }`}
          />
        ))}
      </div>
      {onCancel && (
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 rounded-xl transition-all cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
          Abbrechen
        </button>
      )}
    </div>
  );
}
