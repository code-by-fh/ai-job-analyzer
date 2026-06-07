"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Download,
  FileText,
  Loader2,
  Save,
  RefreshCw,
  Zap,
  User,
  RotateCw,
  X,
} from "lucide-react";
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

const RENDER_PHASE = { label: "PDF wird erstellt…", icon: "📄" };
const RENDER_PHASES = [RENDER_PHASE];

function serializeIframeHtml(iframe: HTMLIFrameElement): string {
  const doc = iframe.contentDocument;
  if (!doc) return "";
  doc.body.removeAttribute("contenteditable");
  const html = `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
  doc.body.contentEditable = "true";
  doc.body.style.outline = "none";
  return html;
}

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

  const [activeView, setActiveView] = useState<ActiveView>("letter");

  // ── Anschreiben ───────────────────────────────────────────────────────────
  const [letterDoc, setLetterDoc] = useState<JobDocument | null>(null);
  const [letterLoading, setLetterLoading] = useState(true);
  const [letterHtml, setLetterHtml] = useState<string | null>(null);
  const [letterHtmlSaving, setLetterHtmlSaving] = useState(false);
  const [letterSaveStatus, setLetterSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [letterPdfUrl, setLetterPdfUrl] = useState<string | null>(null);
  const [letterEditMode, setLetterEditMode] = useState(false);
  const letterIframeRef = useRef<HTMLIFrameElement>(null);

  const [showRegenInput, setShowRegenInput] = useState(false);
  const [regenNote, setRegenNote] = useState("");
  const [isSubmittingRegen, setIsSubmittingRegen] = useState(false);

  const [elapsed, setElapsed] = useState(0);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const phaseRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Lebenslauf ────────────────────────────────────────────────────────────
  const [cvDoc, setCvDoc] = useState<JobDocument | null>(null);
  const [cvLoading, setCvLoading] = useState(true);
  const [cvHtml, setCvHtml] = useState<string | null>(null);
  const [cvHtmlSaving, setCvHtmlSaving] = useState(false);
  const [cvSaveStatus, setCvSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [cvPdfUrl, setCvPdfUrl] = useState<string | null>(null);
  const [cvEditMode, setCvEditMode] = useState(false);
  const cvIframeRef = useRef<HTMLIFrameElement>(null);

  const [cvGenerating, setCvGenerating] = useState(
    () => job.status === "GENERATING" && !!localStorage.getItem(`gen_cv_${job.id}`)
  );
  const [cvElapsed, setCvElapsed] = useState(0);
  const [cvPhaseIndex, setCvPhaseIndex] = useState(0);
  const cvTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cvPhaseRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cvGenerationPending = useRef(
    job.status === "GENERATING" && !!localStorage.getItem(`gen_cv_${job.id}`)
  );

  const isLetterGenerating = isGenerating && !cvGenerationPending.current;
  const letterGeneratingPrevRef = useRef(isLetterGenerating);

  // ── Load functions ────────────────────────────────────────────────────────
  const loadLetterContent = useCallback(async () => {
    setLetterLoading(true);
    try {
      const [docRes, htmlRes] = await Promise.all([
        fetchWithAuth(`${apiBase}/jobs/${job.id}/documents`),
        fetchWithAuth(`${apiBase}/jobs/${job.id}/documents/html?kind=cover_letter`),
      ]);
      if (docRes.ok) {
        const docs: JobDocument[] = await docRes.json();
        const doc = docs.find((d) => d.kind === "GENERATED_LETTER") ?? null;
        setLetterDoc(doc);
        if (doc) {
          const pdfRes = await fetchWithAuth(
            `${apiBase}/jobs/${job.id}/documents/${doc.id}/download`
          );
          if (pdfRes.ok) {
            const blob = await pdfRes.blob();
            setLetterPdfUrl((prev) => {
              if (prev) URL.revokeObjectURL(prev);
              return URL.createObjectURL(blob);
            });
          }
        }
      }
      if (htmlRes.ok) {
        const data = await htmlRes.json();
        setLetterHtml(data.html || null);
      }
    } finally {
      setLetterLoading(false);
    }
  }, [apiBase, job.id]);

  const loadCvContent = useCallback(async () => {
    setCvLoading(true);
    try {
      const [docRes, htmlRes] = await Promise.all([
        fetchWithAuth(`${apiBase}/jobs/${job.id}/documents`),
        fetchWithAuth(`${apiBase}/jobs/${job.id}/documents/html?kind=cv`),
      ]);
      if (docRes.ok) {
        const docs: JobDocument[] = await docRes.json();
        const doc = docs.find((d) => d.kind === "GENERATED_CV") ?? null;
        setCvDoc(doc);
        if (doc) {
          const pdfRes = await fetchWithAuth(
            `${apiBase}/jobs/${job.id}/documents/${doc.id}/download`
          );
          if (pdfRes.ok) {
            const blob = await pdfRes.blob();
            setCvPdfUrl((prev) => {
              if (prev) URL.revokeObjectURL(prev);
              return URL.createObjectURL(blob);
            });
          }
        }
      }
      if (htmlRes.ok) {
        const data = await htmlRes.json();
        setCvHtml(data.html || null);
      }
    } finally {
      setCvLoading(false);
    }
  }, [apiBase, job.id]);

  useEffect(() => { loadLetterContent(); }, [loadLetterContent]);
  useEffect(() => { loadCvContent(); }, [loadCvContent]);

  // ── Inject HTML into letter iframe (edit mode only) ───────────────────────
  useEffect(() => {
    if (!letterEditMode) return;
    const iframe = letterIframeRef.current;
    if (!iframe || !letterHtml) return;
    let objectUrl: string | null = null;
    const onLoad = () => {
      const doc = iframe.contentDocument;
      if (!doc?.body) return;
      doc.body.contentEditable = "true";
      doc.body.style.outline = "none";
      doc.body.style.cursor = "text";
    };
    iframe.addEventListener("load", onLoad);
    const blob = new Blob([letterHtml], { type: "text/html" });
    objectUrl = URL.createObjectURL(blob);
    iframe.src = objectUrl;
    return () => {
      iframe.removeEventListener("load", onLoad);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [letterHtml, letterEditMode]);

  // ── Inject HTML into CV iframe (edit mode only) ───────────────────────────
  useEffect(() => {
    if (!cvEditMode) return;
    const iframe = cvIframeRef.current;
    if (!iframe || !cvHtml) return;
    let objectUrl: string | null = null;
    const onLoad = () => {
      const doc = iframe.contentDocument;
      if (!doc?.body) return;
      doc.body.contentEditable = "true";
      doc.body.style.outline = "none";
      doc.body.style.cursor = "text";
    };
    iframe.addEventListener("load", onLoad);
    const blob = new Blob([cvHtml], { type: "text/html" });
    objectUrl = URL.createObjectURL(blob);
    iframe.src = objectUrl;
    return () => {
      iframe.removeEventListener("load", onLoad);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [cvHtml, cvEditMode]);

  // ── Blob URL cleanup on unmount ───────────────────────────────────────────
  useEffect(() => {
    return () => {
      setLetterPdfUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
      setCvPdfUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
    };
  }, []);

  // ── Exit edit mode when generation starts ─────────────────────────────────
  useEffect(() => {
    if (isLetterGenerating) setLetterEditMode(false);
  }, [isLetterGenerating]);

  useEffect(() => {
    if (cvGenerating) setCvEditMode(false);
  }, [cvGenerating]);

  // ── Letter timer ──────────────────────────────────────────────────────────
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

  useEffect(() => {
    if (letterGeneratingPrevRef.current && !isLetterGenerating && job.application_draft) {
      loadLetterContent();
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

  useEffect(() => {
    if (job.status !== "GENERATING" && cvGenerationPending.current) {
      cvGenerationPending.current = false;
      setCvGenerating(false);
      localStorage.removeItem(`gen_cv_${job.id}`);
      loadCvContent();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.status]);

  // ── Save handlers ─────────────────────────────────────────────────────────
  const handleLetterSave = useCallback(async () => {
    const iframe = letterIframeRef.current;
    if (!iframe || letterHtmlSaving) return;
    const html = serializeIframeHtml(iframe);
    setLetterHtmlSaving(true);
    setLetterSaveStatus("idle");
    try {
      const putRes = await fetchWithAuth(
        `${apiBase}/jobs/${job.id}/documents/html?kind=cover_letter`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ html }),
        }
      );
      if (!putRes.ok) { setLetterSaveStatus("error"); return; }
      await fetchWithAuth(
        `${apiBase}/jobs/${job.id}/documents/render?kind=cover_letter`,
        { method: "POST" }
      );
      setLetterSaveStatus("saved");
      setTimeout(() => setLetterSaveStatus("idle"), 3000);
      setLetterEditMode(false);
      await loadLetterContent();
    } catch {
      setLetterSaveStatus("error");
    } finally {
      setLetterHtmlSaving(false);
    }
  }, [apiBase, job.id, letterHtmlSaving, loadLetterContent]);

  const handleCvSave = useCallback(async () => {
    const iframe = cvIframeRef.current;
    if (!iframe || cvHtmlSaving) return;
    const html = serializeIframeHtml(iframe);
    setCvHtmlSaving(true);
    setCvSaveStatus("idle");
    try {
      const putRes = await fetchWithAuth(
        `${apiBase}/jobs/${job.id}/documents/html?kind=cv`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ html }),
        }
      );
      if (!putRes.ok) { setCvSaveStatus("error"); return; }
      await fetchWithAuth(
        `${apiBase}/jobs/${job.id}/documents/render?kind=cv`,
        { method: "POST" }
      );
      setCvSaveStatus("saved");
      setTimeout(() => setCvSaveStatus("idle"), 3000);
      setCvEditMode(false);
      await loadCvContent();
    } catch {
      setCvSaveStatus("error");
    } finally {
      setCvHtmlSaving(false);
    }
  }, [apiBase, job.id, cvHtmlSaving, loadCvContent]);

  // ── Generate / regen ──────────────────────────────────────────────────────
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
    } catch {
      localStorage.removeItem(`gen_app_${job.id}`);
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
        await fetchWithAuth(`${baseUrl}/jobs/${job.id}/cancel-generation`, { method: "POST" });
      } catch {}
    }
    localStorage.removeItem(`gen_app_${job.id}`);
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

  const handleDownloadCv = () => {
    if (!cvDoc) return;
    const a = document.createElement("a");
    a.href = `${apiBase}/jobs/${job.id}/documents/${cvDoc.id}/download`;
    a.download = cvDoc.original_filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

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
        }
      );
      if (!res.ok) {
        cvGenerationPending.current = false;
        localStorage.removeItem(`gen_cv_${job.id}`);
        setCvGenerating(false);
        alert(`Lebenslauf konnte nicht erstellt werden (HTTP ${res.status})`);
      }
    } catch {
      cvGenerationPending.current = false;
      localStorage.removeItem(`gen_cv_${job.id}`);
      setCvGenerating(false);
    }
  };

  const phase = GENERATION_PHASES[phaseIndex];
  const cvPhase = CV_PHASES[cvPhaseIndex];

  return (
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
          <div className="flex flex-wrap items-center gap-2 bg-slate-50 dark:bg-slate-900/50 px-3 py-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
              <button
                onClick={loadLetterContent}
                disabled={letterLoading}
                className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-all cursor-pointer"
                title="Aktualisieren"
              >
                <RotateCw className={`w-3.5 h-3.5 ${letterLoading ? "animate-spin" : ""}`} />
              </button>
              {!isLetterGenerating && !letterEditMode && (
                <button
                  onClick={() => letterHtml ? setShowRegenInput((v) => !v) : onGenerate(job)}
                  disabled={isSubmittingRegen}
                  className={`p-2 rounded-lg transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer whitespace-nowrap disabled:opacity-40 ${
                    showRegenInput
                      ? "text-purple-600 bg-purple-100 dark:bg-purple-500/20"
                      : "text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10"
                  }`}
                >
                  {isSubmittingRegen ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">{letterHtml ? "Neu generieren" : "Generieren"}</span>
                </button>
              )}
              {letterPdfUrl && !isLetterGenerating && !letterEditMode && (
                <button
                  onClick={() => setLetterEditMode(true)}
                  className="p-2 rounded-lg transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer whitespace-nowrap text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Bearbeiten</span>
                </button>
              )}
              {letterEditMode && (
                <>
                  <button
                    onClick={handleLetterSave}
                    disabled={letterHtmlSaving}
                    className={`p-2 rounded-lg transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer whitespace-nowrap disabled:opacity-50 ${
                      letterSaveStatus === "saved"
                        ? "text-white bg-emerald-600"
                        : letterSaveStatus === "error"
                          ? "text-white bg-rose-600"
                          : "text-white bg-indigo-600 hover:bg-indigo-500 shadow-sm shadow-indigo-500/20"
                    }`}
                  >
                    {letterHtmlSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    <span className="hidden sm:inline">
                      {letterHtmlSaving ? "Speichert…" : letterSaveStatus === "saved" ? "Gespeichert" : letterSaveStatus === "error" ? "Fehler" : "Speichern"}
                    </span>
                  </button>
                  <button
                    onClick={() => setLetterEditMode(false)}
                    disabled={letterHtmlSaving}
                    className="p-2 rounded-lg transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer whitespace-nowrap text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Abbrechen</span>
                  </button>
                </>
              )}
              {letterPdfUrl && !letterEditMode && !isLetterGenerating && (
                <button
                  onClick={handleDownloadLetterDoc}
                  className="p-2 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>PDF</span>
                </button>
              )}
            </div>
          </div>

          {showRegenInput && !letterEditMode && (
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
                  {isSubmittingRegen
                    ? <><Loader2 className="w-3 h-3 animate-spin" /> Wird gestartet…</>
                    : <><RefreshCw className="w-3 h-3" /> Neu generieren</>}
                </button>
              </div>
            </div>
          )}

          {letterHtmlSaving ? (
            <GeneratingSpinner
              phases={RENDER_PHASES}
              phase={RENDER_PHASE}
              elapsed={0}
              phaseIndex={0}
            />
          ) : isLetterGenerating ? (
            <GeneratingSpinner
              phases={GENERATION_PHASES}
              phase={phase}
              elapsed={elapsed}
              phaseIndex={phaseIndex}
              onCancel={handleCancel}
            />
          ) : letterLoading ? (
            <div className="flex items-center justify-center py-16 gap-3 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
              <span className="text-xs font-semibold">Lade Anschreiben…</span>
            </div>
          ) : letterPdfUrl && !letterEditMode ? (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 shadow-lg overflow-hidden flex-1">
              <embed
                src={letterPdfUrl}
                type="application/pdf"
                className="w-full border-0"
                style={{ height: "680px" }}
              />
            </div>
          ) : letterPdfUrl && letterEditMode ? (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 shadow-lg overflow-hidden">
              <iframe
                ref={letterIframeRef}
                sandbox="allow-same-origin"
                className="w-full border-0 bg-white"
                style={{ height: "680px" }}
                title="Anschreiben bearbeiten"
              />
            </div>
          ) : (
            <div className="group flex flex-col items-center justify-center py-12 gap-4 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-900/20 hover:border-indigo-300 dark:hover:border-indigo-500/40 transition-all">
              <div className="w-12 h-12 bg-white dark:bg-slate-800 rounded-xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                <FileText className="w-6 h-6 text-indigo-500" />
              </div>
              <div className="text-center px-6 max-w-xs space-y-1">
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Noch kein Anschreiben</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">KI-generiert und auf dein Profil abgestimmt.</p>
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
        </div>
      )}

      {/* ── LEBENSLAUF VIEW ──────────────────────────────────────────────────── */}
      {activeView === "cv" && (
        <div className="space-y-3 flex-1 flex flex-col">
          <div className="flex flex-wrap items-center gap-2 bg-slate-50 dark:bg-slate-900/50 px-3 py-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
              <button
                onClick={loadCvContent}
                disabled={cvLoading}
                className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-all cursor-pointer"
                title="Aktualisieren"
              >
                <RotateCw className={`w-3.5 h-3.5 ${cvLoading ? "animate-spin" : ""}`} />
              </button>
              {!cvGenerating && !cvEditMode && (
                <button
                  onClick={handleRegenCv}
                  disabled={cvGenerating || isLetterGenerating}
                  className="p-2 rounded-lg transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer whitespace-nowrap disabled:opacity-40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{cvHtml ? "Neu generieren" : "Generieren"}</span>
                </button>
              )}
              {cvPdfUrl && !cvGenerating && !cvEditMode && (
                <button
                  onClick={() => setCvEditMode(true)}
                  className="p-2 rounded-lg transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer whitespace-nowrap text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Bearbeiten</span>
                </button>
              )}
              {cvEditMode && (
                <>
                  <button
                    onClick={handleCvSave}
                    disabled={cvHtmlSaving}
                    className={`p-2 rounded-lg transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer whitespace-nowrap disabled:opacity-50 ${
                      cvSaveStatus === "saved"
                        ? "text-white bg-emerald-600"
                        : cvSaveStatus === "error"
                          ? "text-white bg-rose-600"
                          : "text-white bg-emerald-600 hover:bg-emerald-500 shadow-sm shadow-emerald-500/20"
                    }`}
                  >
                    {cvHtmlSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    <span className="hidden sm:inline">
                      {cvHtmlSaving ? "Speichert…" : cvSaveStatus === "saved" ? "Gespeichert" : cvSaveStatus === "error" ? "Fehler" : "Speichern"}
                    </span>
                  </button>
                  <button
                    onClick={() => setCvEditMode(false)}
                    disabled={cvHtmlSaving}
                    className="p-2 rounded-lg transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer whitespace-nowrap text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Abbrechen</span>
                  </button>
                </>
              )}
              {cvPdfUrl && !cvGenerating && !cvEditMode && (
                <button
                  onClick={handleDownloadCv}
                  className="p-2 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>PDF</span>
                </button>
              )}
            </div>
          </div>

          {cvHtmlSaving ? (
            <GeneratingSpinner
              phases={RENDER_PHASES}
              phase={RENDER_PHASE}
              elapsed={0}
              phaseIndex={0}
              accentClass="emerald"
            />
          ) : cvGenerating ? (
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
          ) : cvPdfUrl && !cvEditMode ? (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 shadow-lg overflow-hidden flex-1">
              <embed
                src={cvPdfUrl}
                type="application/pdf"
                className="w-full border-0"
                style={{ height: "680px" }}
              />
            </div>
          ) : cvPdfUrl && cvEditMode ? (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 shadow-lg overflow-hidden">
              <iframe
                ref={cvIframeRef}
                sandbox="allow-same-origin"
                className="w-full border-0 bg-white"
                style={{ height: "680px" }}
                title="Lebenslauf bearbeiten"
              />
            </div>
          ) : (
            <div className="group flex flex-col items-center justify-center py-16 gap-4 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-900/20 hover:border-emerald-300 dark:hover:border-emerald-500/40 transition-all">
              <div className="w-12 h-12 bg-white dark:bg-slate-800 rounded-xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                <User className="w-6 h-6 text-emerald-500" />
              </div>
              <div className="text-center px-6 max-w-xs space-y-1">
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Noch kein Lebenslauf</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">KI-optimiert auf Basis deines Profils und der Stellenanzeige.</p>
              </div>
              <button
                onClick={() => handleRegenCv()}
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
  );
}

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
        <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{phase.label}</p>
        <p className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">{formatElapsed(elapsed)}</p>
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
