"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { X, Save, Download, Loader2, Layout, Palette } from "lucide-react";
import Portal from "../Portal";
import BlockInspector from "./BlockInspector";
import StylePanel from "./StylePanel";
import { fetchWithAuth } from "../AuthProvider";

type EditorTab = "blocks" | "style";
type DocKind = "cv" | "cover_letter";

interface DocumentEditorProps {
  jobId: string;
  kind: DocKind;
  initialHtml: string;
  apiBase: string;
  onClose: () => void;
  onSaved?: () => void;
}

export default function DocumentEditor({
  jobId,
  kind,
  initialHtml,
  apiBase,
  onClose,
  onSaved,
}: DocumentEditorProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [tab, setTab] = useState<EditorTab>("blocks");
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !initialHtml) return;
    const onLoad = () => {
      const doc = iframe.contentDocument;
      if (!doc) return;
      doc.querySelectorAll("[data-slot]").forEach((el) => {
        (el as HTMLElement).contentEditable = "true";
        (el as HTMLElement).style.outline = "none";
      });
    };
    iframe.addEventListener("load", onLoad);
    const blob = new Blob([initialHtml], { type: "text/html" });
    iframe.src = URL.createObjectURL(blob);
    return () => iframe.removeEventListener("load", onLoad);
  }, [initialHtml]);

  const getSerializedHtml = useCallback((): string => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return initialHtml;
    doc.querySelectorAll("[contenteditable]").forEach((el) => {
      (el as HTMLElement).removeAttribute("contenteditable");
      (el as HTMLElement).style.removeProperty("outline");
    });
    const html = doc.documentElement.outerHTML;
    doc.querySelectorAll("[data-slot]").forEach((el) => {
      (el as HTMLElement).contentEditable = "true";
      (el as HTMLElement).style.outline = "none";
    });
    return `<!DOCTYPE html>\n${html}`;
  }, [initialHtml]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveStatus("idle");
    try {
      const html = getSerializedHtml();
      const res = await fetchWithAuth(
        `${apiBase}/jobs/${jobId}/documents/html?kind=${kind}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ html }),
        }
      );
      if (res.ok) {
        setSaveStatus("saved");
        onSaved?.();
      } else {
        setSaveStatus("error");
      }
    } finally {
      setSaving(false);
    }
  }, [jobId, kind, apiBase, getSerializedHtml, onSaved]);

  const handleRenderPdf = useCallback(async () => {
    await handleSave();
    setRendering(true);
    try {
      await fetchWithAuth(
        `${apiBase}/jobs/${jobId}/documents/render?kind=${kind}`,
        { method: "POST" }
      );
    } finally {
      setRendering(false);
    }
  }, [handleSave, jobId, kind, apiBase]);

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex flex-col bg-slate-100 dark:bg-slate-950">
        {/* Top Bar */}
        <div className="flex items-center gap-3 px-4 h-14 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
          <span className="font-bold text-sm tracking-tight">
            {kind === "cv" ? "Lebenslauf" : "Anschreiben"} bearbeiten
          </span>
          <div className="flex-1" />
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-bold active:scale-95 transition-all disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saveStatus === "saved" ? "Gespeichert" : "Speichern"}
          </button>
          <button
            onClick={handleRenderPdf}
            disabled={rendering || saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-bold active:scale-95 transition-all disabled:opacity-50"
          >
            {rendering ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            PDF
          </button>
          <button
            onClick={() => setInspectorOpen((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm active:scale-95"
            aria-label="Inspector umschalten"
          >
            <Layout className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 active:scale-95"
            aria-label="Schließen"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Canvas */}
          <div className="flex-1 overflow-auto p-6 flex justify-center">
            <div className="w-[210mm] shadow-xl rounded-lg overflow-hidden bg-white">
              <iframe
                ref={iframeRef}
                sandbox="allow-same-origin"
                className="w-full"
                style={{ height: "297mm", border: "none" }}
                title="Dokument-Editor"
              />
            </div>
          </div>

          {/* Inspector */}
          {inspectorOpen && (
            <div className="w-72 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col shrink-0">
              {/* Tab Bar */}
              <div className="flex border-b border-slate-200 dark:border-slate-800">
                {(["blocks", "style"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors ${
                      tab === t
                        ? "text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-500"
                        : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                    }`}
                  >
                    {t === "blocks" ? (
                      <span className="flex items-center justify-center gap-1.5">
                        <Layout className="w-3.5 h-3.5" /> Blöcke
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-1.5">
                        <Palette className="w-3.5 h-3.5" /> Stil
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-y-auto">
                {tab === "blocks" ? (
                  <BlockInspector iframeRef={iframeRef} />
                ) : (
                  <StylePanel iframeRef={iframeRef} />
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </Portal>
  );
}
