"use client";

import { useState, useCallback } from "react";
import { Trash2, UploadCloud, Check, Loader2, Maximize2, X } from "lucide-react";
import { fetchWithAuth } from "../../components/AuthProvider";
import { useNotification } from "../../components/NotificationProvider";
import Portal from "../../components/Portal";
import type { DocumentTemplate } from "../../lib/types";

type DocTab = "CV" | "COVER_LETTER";

interface Props {
  templates: DocumentTemplate[];
  activeIds: { CV: string; COVER_LETTER: string };
  apiBase: string;
  onTemplateAdded: (t: DocumentTemplate) => void;
  onTemplateDeleted: (id: number) => void;
  onActiveChanged: (docType: DocTab, id: string) => void;
}

export default function DocumentTemplateGallery({
  templates,
  activeIds,
  apiBase,
  onTemplateAdded,
  onTemplateDeleted,
  onActiveChanged,
}: Props) {
  const { showError } = useNotification();
  const [tab, setTab] = useState<DocTab>("CV");
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [uploadingTemplate, setUploadingTemplate] = useState(false);
  const [fullscreenId, setFullscreenId] = useState<number | null>(null);
  const [fullscreenHtml, setFullscreenHtml] = useState<string | null>(null);
  const [loadingFullscreen, setLoadingFullscreen] = useState(false);

  const filtered = templates.filter((t) => t.doc_type === tab);
  const activeId = activeIds[tab];

  const loadPreview = useCallback(async (id: number) => {
    if (previewId === id) return;
    setPreviewId(id);
    setPreviewHtml(null);
    setLoadingPreview(true);
    try {
      const res = await fetchWithAuth(`${apiBase}/document-templates/${id}/html`);
      if (res.ok) {
        const data = await res.json();
        setPreviewHtml(data.html);
      }
    } finally {
      setLoadingPreview(false);
    }
  }, [apiBase, previewId]);

  const handleSelect = useCallback(async (tmpl: DocumentTemplate) => {
    if (savingId !== null) return;
    setSavingId(tmpl.id);
    // Load preview in parallel
    loadPreview(tmpl.id);
    try {
      const key = tmpl.doc_type === "CV" ? "cv_template" : "cover_letter_template";
      const res = await fetchWithAuth(`${apiBase}/settings/template`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: String(tmpl.id) }),
      });
      if (res.ok) {
        onActiveChanged(tmpl.doc_type, String(tmpl.id));
      } else {
        showError("Auswahl konnte nicht gespeichert werden");
      }
    } finally {
      setSavingId(null);
    }
  }, [apiBase, savingId, loadPreview, onActiveChanged, showError]);

  const handleDelete = async (id: number) => {
    const res = await fetchWithAuth(`${apiBase}/document-templates/${id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      onTemplateDeleted(id);
      if (previewId === id) {
        setPreviewId(null);
        setPreviewHtml(null);
      }
    } else {
      showError("Löschen fehlgeschlagen");
    }
  };

  const handleUpload = async (file: File) => {
    setUploadingTemplate(true);
    try {
      const html = await file.text();
      const res = await fetchWithAuth(`${apiBase}/document-templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doc_type: tab,
          name: file.name.replace(/\.html?$/, ""),
          html,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showError(err.detail || "Upload fehlgeschlagen");
        return;
      }
      const created: DocumentTemplate = await res.json();
      onTemplateAdded(created);
      loadPreview(created.id);
    } finally {
      setUploadingTemplate(false);
    }
  };

  const openFullscreen = async (id: number) => {
    setFullscreenId(id);
    setFullscreenHtml(null);
    setLoadingFullscreen(true);
    // Reuse already-loaded preview HTML if available
    if (previewId === id && previewHtml) {
      setFullscreenHtml(previewHtml);
      setLoadingFullscreen(false);
      return;
    }
    try {
      const res = await fetchWithAuth(`${apiBase}/document-templates/${id}/html`);
      if (res.ok) {
        const data = await res.json();
        setFullscreenHtml(data.html);
      }
    } finally {
      setLoadingFullscreen(false);
    }
  };

  const closeFullscreen = () => {
    setFullscreenId(null);
    setFullscreenHtml(null);
  };

  const tabLabel = (t: DocTab) => (t === "CV" ? "Lebenslauf" : "Anschreiben");
  const previewTemplate = templates.find((t) => t.id === previewId) ?? null;
  const fullscreenTemplate = templates.find((t) => t.id === fullscreenId) ?? null;

  return (
    <>
      {/* Tab bar */}
      <div className="flex gap-1 mb-4 bg-slate-100 dark:bg-slate-800/50 p-1 rounded-xl w-fit">
        {(["CV", "COVER_LETTER"] as DocTab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTab(t);
              setPreviewId(null);
              setPreviewHtml(null);
            }}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              tab === t
                ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm"
                : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            {tabLabel(t)}
          </button>
        ))}
      </div>

      {/* Split layout */}
      <div className="flex gap-4" style={{ minHeight: 340 }}>
        {/* Left: template list */}
        <div className="w-52 flex-shrink-0 flex flex-col gap-1.5">
          {filtered.length === 0 && (
            <p className="text-xs text-slate-400 py-4 text-center">
              Noch keine Templates
            </p>
          )}

          {filtered.map((tmpl) => {
            const isActive = activeId === String(tmpl.id);
            const isPreviewed = previewId === tmpl.id;
            const isSaving = savingId === tmpl.id;

            return (
              <button
                key={tmpl.id}
                type="button"
                onClick={() => handleSelect(tmpl)}
                disabled={savingId !== null}
                className={`w-full text-left px-3 py-2.5 rounded-xl border-2 transition-all group flex items-center gap-2 cursor-pointer disabled:cursor-wait ${
                  isActive
                    ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10"
                    : isPreviewed
                    ? "border-indigo-300 dark:border-indigo-500/40 bg-white dark:bg-slate-900/50"
                    : "border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-500/40 bg-white dark:bg-slate-900/50"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold truncate text-slate-800 dark:text-slate-100">
                    {tmpl.name}
                  </div>
                  {isActive ? (
                    <div className="text-[10px] font-semibold text-indigo-500 mt-0.5 flex items-center gap-1">
                      <Check className="w-2.5 h-2.5" /> Aktiv
                    </div>
                  ) : tmpl.is_admin ? (
                    <div className="text-[10px] text-slate-400 mt-0.5">Global</div>
                  ) : null}
                </div>

                {isSaving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400 flex-shrink-0" />
                ) : !tmpl.is_admin ? (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); handleDelete(tmpl.id); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); handleDelete(tmpl.id); } }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all cursor-pointer flex-shrink-0"
                    aria-label="Template löschen"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </span>
                ) : null}
              </button>
            );
          })}

          {/* Upload */}
          <label
            className={`mt-1 w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500/50 transition-colors text-xs font-semibold text-slate-400 hover:text-indigo-500 cursor-pointer ${
              uploadingTemplate ? "opacity-50 pointer-events-none" : ""
            }`}
          >
            {uploadingTemplate ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <UploadCloud className="w-3.5 h-3.5" />
            )}
            HTML hochladen
            <input
              type="file"
              accept=".html,.htm"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
                e.target.value = "";
              }}
            />
          </label>
        </div>

        {/* Right: preview panel */}
        <div className="flex-1 flex flex-col gap-2 min-w-0">
          {previewId === null ? (
            <div className="flex-1 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 flex items-center justify-center" style={{ minHeight: 260 }}>
              <p className="text-sm text-slate-400 dark:text-slate-500 text-center px-4">
                Template anklicken zum Auswählen und Vorschau
              </p>
            </div>
          ) : (
            <>
              {/* Preview header */}
              <div className="flex items-center justify-between gap-2 flex-shrink-0">
                <span className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate">
                  {previewTemplate?.name}
                  <span className="ml-2 text-xs font-normal text-slate-400">{tabLabel(tab)}</span>
                </span>
                <button
                  type="button"
                  onClick={() => previewId && openFullscreen(previewId)}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-400 hover:text-indigo-500 transition-all cursor-pointer"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  Vollbild
                </button>
              </div>

              {/* Scaled iframe preview */}
              <div
                className="flex-1 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 overflow-hidden relative"
                style={{ minHeight: 260 }}
              >
                {loadingPreview ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                  </div>
                ) : previewHtml ? (
                  <div className="absolute inset-0 overflow-hidden">
                    <iframe
                      key={previewId}
                      srcDoc={previewHtml}
                      sandbox="allow-same-origin"
                      title="Template-Vorschau"
                      className="border-none pointer-events-none"
                      style={{
                        width: "794px",
                        height: "1123px",
                        transformOrigin: "top left",
                      }}
                      onLoad={(e) => {
                        const el = e.target as HTMLIFrameElement;
                        const container = el.parentElement;
                        if (!container) return;
                        const scale = container.clientWidth / 794;
                        el.style.transform = `scale(${scale})`;
                        container.style.height = `${Math.round(1123 * scale)}px`;
                      }}
                    />
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Fullscreen modal */}
      {fullscreenId !== null && (
        <Portal>
          <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/80 backdrop-blur-sm">
            {/* Modal toolbar */}
            <div className="flex items-center justify-between px-6 h-14 bg-slate-900 border-b border-slate-700 flex-shrink-0">
              <span className="text-white font-bold text-sm">
                {fullscreenTemplate?.name}
                <span className="ml-2 text-xs font-normal text-slate-400">{tabLabel(tab)}</span>
              </span>
              <button
                type="button"
                onClick={closeFullscreen}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-700 transition-all cursor-pointer"
                aria-label="Schließen"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable A4 canvas */}
            <div className="flex-1 overflow-auto flex justify-center py-8 px-4">
              {loadingFullscreen ? (
                <div className="flex items-center justify-center w-full">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
                </div>
              ) : fullscreenHtml ? (
                <div
                  className="bg-white shadow-2xl rounded-sm"
                  style={{ width: "210mm", minHeight: "297mm" }}
                >
                  <iframe
                    key={`fs-${fullscreenId}`}
                    srcDoc={fullscreenHtml}
                    sandbox="allow-same-origin"
                    title="Template-Vollbild"
                    className="border-none"
                    style={{ width: "210mm", height: "297mm", display: "block" }}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}
