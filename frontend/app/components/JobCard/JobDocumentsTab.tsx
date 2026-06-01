"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  StickyNote,
  Paperclip,
  Upload,
  Trash2,
  Download,
  FileText,
  FileImage,
  File as FileLucide,
  CheckSquare,
  Square,
  Plus,
  X,
  Eye,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Loader2,
  Check,
  ShieldAlert,
} from "lucide-react";
import type { Job } from "../../lib/types";
import { useRouter } from "next/navigation";
import ConfirmModal from "../ConfirmModal";
import { useNotification } from "../NotificationProvider";
import { fetchWithAuth } from "../AuthProvider";
import { useLanguage } from "../LanguageProvider";

interface JobDocument {
  id: number;
  original_filename: string;
  file_size: number | null;
  mime_type: string | null;
  uploaded_at: string | null;
}

interface TodoItem {
  id: string;
  text: string;
  done: boolean;
}

interface JobDocumentsTabProps {
  job: Job;
  apiBase?: string;
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({
  mime,
  className = "w-4 h-4",
}: {
  mime: string | null;
  className?: string;
}) {
  if (!mime) return <FileLucide className={className} />;
  if (mime.startsWith("image/")) return <FileImage className={className} />;
  if (mime === "application/pdf") return <FileText className={className} />;
  return <FileLucide className={className} />;
}

function isViewable(mime: string | null): boolean {
  if (!mime) return false;
  return mime === "application/pdf" || mime.startsWith("image/");
}

// ── PDF / Image Viewer Modal ───────────────────────────────────────────────────
function FileViewerModal({
  doc,
  viewUrl,
  downloadUrl,
  onClose,
}: {
  doc: JobDocument;
  viewUrl: string;
  downloadUrl: string;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const isPdf = doc.mime_type === "application/pdf";
  const isImage = doc.mime_type?.startsWith("image/") ?? false;

  // Fetch document via authenticated request and create a blob URL.
  // This bypasses X-Frame-Options: DENY and handles cookie auth correctly.
  useEffect(() => {
    let objectUrl: string | null = null;
    setLoadError(false);
    setBlobUrl(null);

    fetchWithAuth(viewUrl)
      .then(async (res) => {
        if (!res.ok) { setLoadError(true); return; }
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      })
      .catch(() => setLoadError(true));

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [viewUrl]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const modal = (
    <div
      className="fixed inset-0 z-[9999] flex flex-col bg-black/80 backdrop-blur-md"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-4 bg-slate-900/95 border-b border-slate-800 flex-shrink-0 animate-in slide-in-from-top duration-300">
        <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
          <FileIcon mime={doc.mime_type} className="w-4 h-4 text-indigo-400" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-bold text-white truncate block">
            {doc.original_filename}
          </span>
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">
            {formatBytes(doc.file_size)}
          </span>
        </div>

        {isImage && (
          <div className="flex items-center gap-1 bg-slate-800/50 p-1 rounded-xl border border-slate-700/50 shadow-inner">
            <button
              onClick={() => setZoom((z) => Math.max(25, z - 25))}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors cursor-pointer"
              title={t("zoomOut" as any) || "Zoom Out"}
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-[10px] font-black text-slate-400 w-10 text-center">
              {zoom}%
            </span>
            <button
              onClick={() => setZoom((z) => Math.min(300, z + 25))}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors cursor-pointer"
              title={t("zoomIn" as any) || "Zoom In"}
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <div className="w-px h-4 bg-slate-700 mx-1" />
            <button
              onClick={() => setRotation((r) => (r + 90) % 360)}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors cursor-pointer"
              title={t("rotate" as any) || "Rotate"}
            >
              <RotateCw className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="flex items-center gap-2">
          <a
            href={downloadUrl}
            download={doc.original_filename}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-indigo-600 transition-all cursor-pointer shadow-sm border border-slate-700"
            title={t("downloadFile")}
          >
            <Download className="w-4 h-4" />
          </a>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-800 text-slate-300 hover:text-rose-500 hover:bg-rose-500/10 transition-all cursor-pointer shadow-sm border border-slate-700"
            title={t("close")}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto flex items-start justify-center p-6 min-h-0">
        {loadError && (
          <div className="flex flex-col items-center justify-center gap-3 text-slate-400">
            <ShieldAlert className="w-10 h-10 text-rose-400" />
            <span className="text-sm font-semibold">{t("loadingFile" as any) || "Datei konnte nicht geladen werden"}</span>
          </div>
        )}
        {!blobUrl && !loadError && (
          <div className="flex flex-col items-center justify-center gap-3 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
          </div>
        )}
        {isPdf && blobUrl && (
          <div className="w-full h-full max-w-5xl rounded-2xl overflow-hidden shadow-2xl border border-slate-800 bg-slate-900 flex flex-col">
            <iframe
              src={blobUrl}
              className="flex-1 w-full border-0"
              title={doc.original_filename}
            />
          </div>
        )}
        {isImage && blobUrl && (
          <div className="flex items-center justify-center p-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={blobUrl}
              alt={doc.original_filename}
              style={{
                transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
                transformOrigin: "center center",
                transition: "transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                maxWidth: "100%",
              }}
              className="rounded-2xl shadow-2xl border border-slate-800"
            />
          </div>
        )}
      </div>
    </div>
  );

  if (typeof window === "undefined") return null;
  return createPortal(modal, document.body);
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function JobDocumentsTab({
  job,
  apiBase = "",
}: JobDocumentsTabProps) {
  const router = useRouter();
  const { t } = useLanguage();
  const [notes, setNotes] = useState(job.notes || "");
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { showError } = useNotification();
  const [documents, setDocuments] = useState<JobDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [viewerDoc, setViewerDoc] = useState<JobDocument | null>(null);
  const [uploadErrorModal, setUploadErrorModal] = useState<string | null>(null);

  const [todos, setTodos] = useState<TodoItem[]>(() => {
    try {
      const stored = localStorage.getItem(`job-todos-${job.id}`);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [newTodo, setNewTodo] = useState("");

  useEffect(() => {
    setNotes(job.notes || "");
  }, [job.notes]);

  useEffect(() => {
    localStorage.setItem(`job-todos-${job.id}`, JSON.stringify(todos));
  }, [todos, job.id]);

  const loadDocuments = useCallback(async () => {
    setDocsLoading(true);
    try {
      const res = await fetchWithAuth(`${apiBase}/jobs/${job.id}/documents`);
      if (res.ok) setDocuments(await res.json());
      else showError(`GET /jobs/${job.id}/documents → HTTP ${res.status}`);
    } catch {
      showError(`GET /jobs/${job.id}/documents failed`);
    } finally {
      setDocsLoading(false);
    }
  }, [apiBase, job.id, showError]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const handleNotesChange = (value: string) => {
    setNotes(value);
    setNotesSaved(false);
    if (notesTimer.current) clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(async () => {
      setNotesSaving(true);
      try {
        const res = await fetchWithAuth(`${apiBase}/jobs/${job.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: value }),
        });
        if (res.ok) {
          setNotesSaved(true);
          setTimeout(() => setNotesSaved(false), 2000);
        } else {
          showError(`PATCH /jobs/${job.id} → HTTP ${res.status}`);
        }
      } catch {
        showError(`PATCH /jobs/${job.id} failed`);
      } finally {
        setNotesSaving(false);
      }
    }, 800);
  };

  const uploadFile = async (file: File) => {
    if (uploading) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetchWithAuth(`${apiBase}/jobs/${job.id}/documents`, {
        method: "POST",
        body: form,
      });
      if (res.ok) {
        await loadDocuments();
      } else {
        const err = await res.json().catch(() => ({}));
        setUploadErrorModal(err.detail || "Upload failed");
      }
    } finally {
      setUploading(false);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  };

  const deleteDocument = async (docId: number) => {
    try {
      const res = await fetchWithAuth(
        `${apiBase}/jobs/${job.id}/documents/${docId}`,
        {
          method: "DELETE",
        },
      );
      if (res.ok) setDocuments((prev) => prev.filter((d) => d.id !== docId));
      else
        showError(
          `DELETE /jobs/${job.id}/documents/${docId} → HTTP ${res.status}`,
        );
    } catch {
      showError(`DELETE /jobs/${job.id}/documents/${docId} failed`);
    }
  };

  const addTodo = () => {
    const text = newTodo.trim();
    if (!text) return;
    setTodos((prev) => [
      ...prev,
      { id: Date.now().toString(), text, done: false },
    ]);
    setNewTodo("");
  };

  const toggleTodo = (id: string) =>
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    );
  const deleteTodo = (id: string) =>
    setTodos((prev) => prev.filter((t) => t.id !== id));
  const doneTodos = todos.filter((t) => t.done).length;

  return (
    <div className="space-y-6">
      {/* Viewer Modal */}
      {viewerDoc && (
        <FileViewerModal
          doc={viewerDoc}
          viewUrl={`${apiBase}/jobs/${job.id}/documents/${viewerDoc.id}/view`}
          downloadUrl={`${apiBase}/jobs/${job.id}/documents/${viewerDoc.id}/download`}
          onClose={() => setViewerDoc(null)}
        />
      )}

      {/* ── NOTIZEN ── */}
      <section className="animate-in fade-in slide-in-from-bottom-2 duration-300 delay-75">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-lg bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
            <StickyNote className="w-3.5 h-3.5 text-amber-500" />
          </div>
          <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
            {t("notes")}
          </span>
          {notesSaving && (
            <span className="text-[10px] font-bold text-slate-400 ml-auto animate-pulse">
              {t("savingNotes")}
            </span>
          )}
          {notesSaved && (
            <span className="text-[10px] font-bold text-emerald-500 ml-auto">
              {t("notesSaved")}
            </span>
          )}
        </div>
        <div className="bg-slate-50/50 dark:bg-slate-800/20 border border-slate-100 dark:border-slate-800/50 rounded-2xl p-1 shadow-sm">
          <textarea
            value={notes}
            onChange={(e) => handleNotesChange(e.target.value)}
            placeholder={t("personalNotesPlaceholder")}
            rows={6}
            className="w-full font-mono text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
          />
        </div>
      </section>

      {/* ── AUFGABEN ── */}
      <section className="animate-in fade-in slide-in-from-bottom-2 duration-300 delay-150">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-lg bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
            <CheckSquare className="w-3.5 h-3.5 text-indigo-500" />
          </div>
          <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
            {t("tasks")}
          </span>
          {todos.length > 0 && (
            <span className="ml-auto text-[10px] font-bold text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
              {doneTodos}/{todos.length}
            </span>
          )}
        </div>
        <div className="bg-slate-50/50 dark:bg-slate-800/20 border border-slate-100 dark:border-slate-800/50 rounded-2xl overflow-hidden shadow-sm">
          <div className="divide-y divide-slate-100 dark:divide-slate-800/50">
            {todos.length === 0 && (
              <p className="text-xs text-slate-400 dark:text-slate-500 px-4 py-6 text-center italic">
                {t("noTasks")}
              </p>
            )}
            {todos.map((todo) => (
              <div
                key={todo.id}
                className={`flex items-center gap-3 px-4 py-3 group/todo transition-colors ${todo.done ? "bg-slate-50/30 dark:bg-slate-900/10" : "bg-white dark:bg-slate-900/40 hover:bg-white dark:hover:bg-slate-900"}`}
              >
                <button
                  onClick={() => toggleTodo(todo.id)}
                  className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all cursor-pointer
                                        ${todo.done ? "bg-emerald-500 border-emerald-500 text-white shadow-sm" : "bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600"}`}
                >
                  {todo.done ? (
                    <Check size={12} strokeWidth={3} />
                  ) : (
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-100 dark:bg-slate-700" />
                  )}
                </button>
                <span
                  className={`flex-1 text-xs font-semibold ${todo.done ? "line-through text-slate-400 dark:text-slate-600" : "text-slate-700 dark:text-slate-200"}`}
                >
                  {todo.text}
                </span>
                <button
                  onClick={() => deleteTodo(todo.id)}
                  className="opacity-0 group-hover/todo:opacity-100 w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
          <div className="p-3 bg-white dark:bg-slate-900/60 border-t border-slate-100 dark:border-slate-800/50">
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-950/40 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 transition-all focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-400/50">
              <input
                type="text"
                value={newTodo}
                onChange={(e) => setNewTodo(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTodo()}
                placeholder={t("newTask")}
                className="flex-1 text-xs bg-transparent text-slate-700 dark:text-slate-300 placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none font-medium"
              />
              <button
                onClick={addTodo}
                disabled={!newTodo.trim()}
                className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-lg bg-indigo-500 text-white disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 transition-all cursor-pointer shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── DATEIEN ── */}
      <section className="animate-in fade-in slide-in-from-bottom-2 duration-300 delay-225">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-lg bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
            <Paperclip className="w-3.5 h-3.5 text-indigo-500" />
          </div>
          <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
            {t("files")}
          </span>
          <span className="ml-auto text-[10px] font-bold text-slate-400 dark:text-slate-500">
            {t("fileLimitInfo")}
          </span>
        </div>

        {/* Drop zone */}
        <div className="bg-slate-50/50 dark:bg-slate-800/20 border border-slate-100 dark:border-slate-800/50 rounded-2xl p-1 shadow-sm overflow-hidden">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`
                            relative flex flex-col items-center justify-center gap-3 p-8
                            rounded-xl border-2 border-dashed cursor-pointer transition-all duration-300
                            ${
                              dragOver
                                ? "border-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 scale-[1.01] shadow-lg shadow-indigo-500/5"
                                : "border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600 bg-white dark:bg-slate-900/50 hover:bg-slate-50 dark:hover:bg-slate-800"
                            }
                            ${uploading ? "pointer-events-none opacity-60" : ""}
                        `}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileInput}
              accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.webp"
            />
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 ${dragOver ? "bg-indigo-500 text-white animate-bounce" : "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 shadow-inner"}`}
            >
              <Upload className="w-6 h-6" />
            </div>
            <div className="text-center">
              <p
                className={`text-xs font-bold mb-1 ${dragOver ? "text-indigo-600 dark:text-indigo-400" : "text-slate-700 dark:text-slate-300"}`}
              >
                {uploading ? t("uploading") : t("dropFileHere")}
              </p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                Maximale Dateigröße 10 MB
              </p>
            </div>
          </div>
        </div>

        {/* File list */}
        {docsLoading ? (
          <div className="mt-4 p-8 bg-slate-50/30 dark:bg-slate-900/20 rounded-2xl border border-slate-100 dark:border-slate-800/50 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              {t("loadingFile")}
            </span>
          </div>
        ) : documents.length > 0 ? (
          <div className="mt-4 space-y-2">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center gap-3 p-3 rounded-2xl bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-500/30 group/doc transition-all hover:shadow-sm"
              >
                {/* Icon / Preview trigger */}
                <div
                  onClick={() =>
                    isViewable(doc.mime_type) ? setViewerDoc(doc) : undefined
                  }
                  className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-all
                                        ${
                                          isViewable(doc.mime_type)
                                            ? "bg-indigo-50 dark:bg-indigo-500/10 border-indigo-100 dark:border-indigo-500/20 text-indigo-500 cursor-pointer hover:bg-indigo-100"
                                            : "bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-800/50 text-slate-400 cursor-default"
                                        }`}
                  title={isViewable(doc.mime_type) ? t("viewFile") : undefined}
                >
                  <FileIcon mime={doc.mime_type} className="w-5 h-5" />
                </div>

                {/* Name + meta */}
                <div
                  className={`flex-1 min-w-0 ${isViewable(doc.mime_type) ? "cursor-pointer" : ""}`}
                  onClick={() => isViewable(doc.mime_type) && setViewerDoc(doc)}
                >
                  <p
                    className={`text-xs font-bold truncate transition-colors ${isViewable(doc.mime_type) ? "text-slate-700 dark:text-slate-200 group-hover/doc:text-indigo-600 dark:group-hover/doc:text-indigo-400" : "text-slate-700 dark:text-slate-200"}`}
                  >
                    {doc.original_filename}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tight">
                      {formatBytes(doc.file_size)}
                    </p>
                    <span className="w-1 h-1 rounded-full bg-slate-200 dark:bg-slate-800" />
                    <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500">
                      {doc.uploaded_at &&
                        new Date(doc.uploaded_at).toLocaleDateString("de-DE")}
                    </p>
                    {isViewable(doc.mime_type) && (
                      <>
                        <span className="w-1 h-1 rounded-full bg-slate-200 dark:bg-slate-800" />
                        <span className="text-[10px] font-black text-indigo-400 uppercase tracking-tighter opacity-0 group-hover/doc:opacity-100 transition-opacity">
                          {t("clickToOpen")}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 opacity-0 group-hover/doc:opacity-100 transition-opacity pr-1">
                  {isViewable(doc.mime_type) && (
                    <button
                      onClick={() => setViewerDoc(doc)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-all cursor-pointer border border-transparent hover:border-indigo-100"
                      title={t("viewFile")}
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <a
                    href={`${apiBase}/jobs/${job.id}/documents/${doc.id}/download`}
                    download={doc.original_filename}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-all cursor-pointer border border-transparent hover:border-indigo-100"
                    title={t("downloadFile")}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Download className="w-3.5 h-3.5" />
                  </a>
                  <button
                    onClick={() => deleteDocument(doc.id)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all cursor-pointer border border-transparent hover:border-rose-100"
                    title={t("delete")}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 p-8 bg-slate-50/30 dark:bg-slate-900/20 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center text-center">
            <FileLucide className="w-6 h-6 text-slate-300 dark:text-slate-700 mb-2 opacity-20" />
            <p className="text-xs font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest">
              {t("noFiles")}
            </p>
          </div>
        )}
      </section>

      <ConfirmModal
        isOpen={!!uploadErrorModal}
        title={t("storageRequired")}
        message={t("storageRequiredMessage")}
        onClose={() => setUploadErrorModal(null)}
        onConfirm={() => {
          setUploadErrorModal(null);
          router.push("/settings?tab=storage");
        }}
        confirmText={t("goToSettings")}
        cancelText={t("close")}
      />
    </div>
  );
}
