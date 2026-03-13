'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { StickyNote, Paperclip, Upload, Trash2, Download, FileText, FileImage, File, CheckSquare, Square, Plus, X, Eye, ZoomIn, ZoomOut, RotateCw } from 'lucide-react';
import type { Job } from '../../lib/types';

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
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({ mime, className = 'w-4 h-4' }: { mime: string | null; className?: string }) {
    if (!mime) return <File className={className} />;
    if (mime.startsWith('image/')) return <FileImage className={className} />;
    if (mime === 'application/pdf') return <FileText className={className} />;
    return <File className={className} />;
}

function isViewable(mime: string | null): boolean {
    if (!mime) return false;
    return mime === 'application/pdf' || mime.startsWith('image/');
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
    const [zoom, setZoom] = useState(100);
    const [rotation, setRotation] = useState(0);
    const isPdf = doc.mime_type === 'application/pdf';
    const isImage = doc.mime_type?.startsWith('image/') ?? false;

    // Close on Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    const modal = (
        <div
            className="fixed inset-0 z-[9999] flex flex-col bg-black/80 backdrop-blur-sm"
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
            {/* Toolbar */}
            <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-900/95 border-b border-slate-700/60 flex-shrink-0">
                <FileIcon mime={doc.mime_type} className="w-4 h-4 text-indigo-400" />
                <span className="text-sm font-medium text-white truncate flex-1">{doc.original_filename}</span>
                <span className="text-xs text-slate-400 flex-shrink-0">{formatBytes(doc.file_size)}</span>

                {isImage && (
                    <>
                        <div className="w-px h-4 bg-slate-600 mx-1" />
                        <button
                            onClick={() => setZoom(z => Math.max(25, z - 25))}
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors cursor-pointer"
                            title="Verkleinern"
                        >
                            <ZoomOut className="w-4 h-4" />
                        </button>
                        <span className="text-xs text-slate-400 w-12 text-center">{zoom}%</span>
                        <button
                            onClick={() => setZoom(z => Math.min(300, z + 25))}
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors cursor-pointer"
                            title="Vergrößern"
                        >
                            <ZoomIn className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setRotation(r => (r + 90) % 360)}
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors cursor-pointer"
                            title="Drehen"
                        >
                            <RotateCw className="w-4 h-4" />
                        </button>
                    </>
                )}

                <div className="w-px h-4 bg-slate-600 mx-1" />
                <a
                    href={downloadUrl}
                    download={doc.original_filename}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors cursor-pointer"
                    title="Herunterladen"
                >
                    <Download className="w-4 h-4" />
                </a>
                <button
                    onClick={onClose}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors cursor-pointer"
                    title="Schließen"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto flex items-start justify-center p-4 min-h-0">
                {isPdf && (
                    <iframe
                        src={viewUrl}
                        className="w-full h-full min-h-[70vh] rounded-lg border border-slate-700/40"
                        style={{ maxWidth: '900px' }}
                        title={doc.original_filename}
                    />
                )}
                {isImage && (
                    <div className="flex items-center justify-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={viewUrl}
                            alt={doc.original_filename}
                            style={{
                                transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
                                transformOrigin: 'center center',
                                transition: 'transform 0.2s ease',
                                maxWidth: '100%',
                            }}
                            className="rounded-lg shadow-2xl"
                        />
                    </div>
                )}
            </div>
        </div>
    );

    if (typeof window === 'undefined') return null;
    return createPortal(modal, document.body);
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function JobDocumentsTab({ job, apiBase = '' }: JobDocumentsTabProps) {
    const [notes, setNotes] = useState(job.notes || '');
    const [notesSaving, setNotesSaving] = useState(false);
    const [notesSaved, setNotesSaved] = useState(false);
    const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [documents, setDocuments] = useState<JobDocument[]>([]);
    const [docsLoading, setDocsLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [viewerDoc, setViewerDoc] = useState<JobDocument | null>(null);

    const [todos, setTodos] = useState<TodoItem[]>(() => {
        try {
            const stored = localStorage.getItem(`job-todos-${job.id}`);
            return stored ? JSON.parse(stored) : [];
        } catch {
            return [];
        }
    });
    const [newTodo, setNewTodo] = useState('');

    useEffect(() => { setNotes(job.notes || ''); }, [job.notes]);

    useEffect(() => {
        localStorage.setItem(`job-todos-${job.id}`, JSON.stringify(todos));
    }, [todos, job.id]);

    const loadDocuments = useCallback(async () => {
        setDocsLoading(true);
        try {
            const res = await fetch(`${apiBase}/jobs/${job.id}/documents`, { credentials: 'include' });
            if (res.ok) setDocuments(await res.json());
        } catch { /* ignore */ } finally {
            setDocsLoading(false);
        }
    }, [apiBase, job.id]);

    useEffect(() => { loadDocuments(); }, [loadDocuments]);

    const handleNotesChange = (value: string) => {
        setNotes(value);
        setNotesSaved(false);
        if (notesTimer.current) clearTimeout(notesTimer.current);
        notesTimer.current = setTimeout(async () => {
            setNotesSaving(true);
            try {
                await fetch(`${apiBase}/jobs/${job.id}`, {
                    method: 'PATCH',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ notes: value }),
                });
                setNotesSaved(true);
                setTimeout(() => setNotesSaved(false), 2000);
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
            form.append('file', file);
            const res = await fetch(`${apiBase}/jobs/${job.id}/documents`, {
                method: 'POST',
                credentials: 'include',
                body: form,
            });
            if (res.ok) {
                await loadDocuments();
            } else {
                const err = await res.json().catch(() => ({}));
                alert(err.detail || 'Upload fehlgeschlagen');
            }
        } finally {
            setUploading(false);
        }
    };

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) uploadFile(file);
        e.target.value = '';
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) uploadFile(file);
    };

    const deleteDocument = async (docId: number) => {
        try {
            const res = await fetch(`${apiBase}/jobs/${job.id}/documents/${docId}`, {
                method: 'DELETE',
                credentials: 'include',
            });
            if (res.ok) setDocuments(prev => prev.filter(d => d.id !== docId));
        } catch { /* ignore */ }
    };

    const addTodo = () => {
        const text = newTodo.trim();
        if (!text) return;
        setTodos(prev => [...prev, { id: Date.now().toString(), text, done: false }]);
        setNewTodo('');
    };

    const toggleTodo = (id: string) => setTodos(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t));
    const deleteTodo = (id: string) => setTodos(prev => prev.filter(t => t.id !== id));
    const doneTodos = todos.filter(t => t.done).length;

    return (
        <div className="space-y-5">

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
            <section>
                <div className="flex items-center gap-2 mb-2">
                    <StickyNote className="w-3.5 h-3.5 text-amber-500" />
                    <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Notizen</span>
                    {notesSaving && <span className="text-[10px] text-slate-400 ml-auto">Speichern…</span>}
                    {notesSaved && <span className="text-[10px] text-emerald-500 ml-auto">Gespeichert</span>}
                </div>
                <textarea
                    value={notes}
                    onChange={e => handleNotesChange(e.target.value)}
                    placeholder="Notizen zur Stelle, Gesprächsnotizen, persönliche Eindrücke…"
                    rows={5}
                    className="w-full text-sm bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-600 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400 transition"
                />
            </section>

            {/* ── AUFGABEN ── */}
            <section>
                <div className="flex items-center gap-2 mb-2">
                    <CheckSquare className="w-3.5 h-3.5 text-indigo-500" />
                    <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Aufgaben</span>
                    {todos.length > 0 && (
                        <span className="ml-auto text-[10px] text-slate-400 dark:text-slate-500">{doneTodos}/{todos.length}</span>
                    )}
                </div>
                <div className="bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-slate-100 dark:border-slate-800/50 overflow-hidden">
                    {todos.length === 0 && (
                        <p className="text-xs text-slate-400 dark:text-slate-500 px-3 py-2.5">Keine Aufgaben – füge eine hinzu.</p>
                    )}
                    {todos.map(todo => (
                        <div key={todo.id} className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 dark:border-slate-800/50 last:border-0 group/todo">
                            <button onClick={() => toggleTodo(todo.id)} className="flex-shrink-0 text-slate-400 hover:text-indigo-500 transition-colors cursor-pointer">
                                {todo.done ? <CheckSquare className="w-4 h-4 text-emerald-500" /> : <Square className="w-4 h-4" />}
                            </button>
                            <span className={`flex-1 text-xs ${todo.done ? 'line-through text-slate-400 dark:text-slate-600' : 'text-slate-700 dark:text-slate-300'}`}>
                                {todo.text}
                            </span>
                            <button onClick={() => deleteTodo(todo.id)} className="opacity-0 group-hover/todo:opacity-100 text-slate-300 hover:text-rose-500 transition-all cursor-pointer">
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    ))}
                    <div className="flex items-center gap-2 px-3 py-2 border-t border-slate-100 dark:border-slate-800/50">
                        <input
                            type="text"
                            value={newTodo}
                            onChange={e => setNewTodo(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && addTodo()}
                            placeholder="Neue Aufgabe…"
                            className="flex-1 text-xs bg-transparent text-slate-700 dark:text-slate-300 placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none"
                        />
                        <button onClick={addTodo} disabled={!newTodo.trim()} className="flex-shrink-0 text-indigo-500 hover:text-indigo-700 disabled:text-slate-300 dark:disabled:text-slate-700 transition-colors cursor-pointer disabled:cursor-not-allowed">
                            <Plus className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </section>

            {/* ── DATEIEN ── */}
            <section>
                <div className="flex items-center gap-2 mb-2">
                    <Paperclip className="w-3.5 h-3.5 text-purple-500" />
                    <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Dateien</span>
                    <span className="ml-auto text-[10px] text-slate-400 dark:text-slate-500">PDF, DOCX, Bild – max. 10 MB</span>
                </div>

                {/* Drop zone */}
                <div
                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`
                        relative flex flex-col items-center justify-center gap-2 p-5
                        rounded-xl border-2 border-dashed cursor-pointer transition-all
                        ${dragOver
                            ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 scale-[1.01]'
                            : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600 bg-slate-50 dark:bg-slate-950/30 hover:bg-indigo-50/30 dark:hover:bg-indigo-500/5'
                        }
                        ${uploading ? 'pointer-events-none opacity-60' : ''}
                    `}
                >
                    <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileInput}
                        accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.webp" />
                    <Upload className={`w-6 h-6 ${dragOver ? 'text-indigo-500' : 'text-slate-400 dark:text-slate-600'}`} />
                    <p className={`text-xs font-medium ${dragOver ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}`}>
                        {uploading ? 'Wird hochgeladen…' : 'Datei hier ablegen oder klicken'}
                    </p>
                </div>

                {/* File list */}
                {docsLoading ? (
                    <div className="mt-3 text-xs text-slate-400 dark:text-slate-500 text-center py-2">Laden…</div>
                ) : documents.length > 0 ? (
                    <div className="mt-3 space-y-1.5">
                        {documents.map(doc => (
                            <div
                                key={doc.id}
                                className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 group/doc"
                            >
                                {/* Icon / Preview trigger */}
                                <button
                                    onClick={() => isViewable(doc.mime_type) ? setViewerDoc(doc) : undefined}
                                    className={`flex-shrink-0 transition-colors ${isViewable(doc.mime_type) ? 'text-indigo-400 hover:text-indigo-600 cursor-pointer' : 'text-slate-400 cursor-default'}`}
                                    title={isViewable(doc.mime_type) ? 'Anzeigen' : undefined}
                                >
                                    <FileIcon mime={doc.mime_type} />
                                </button>

                                {/* Name + meta */}
                                <div
                                    className={`flex-1 min-w-0 ${isViewable(doc.mime_type) ? 'cursor-pointer' : ''}`}
                                    onClick={() => isViewable(doc.mime_type) && setViewerDoc(doc)}
                                >
                                    <p className={`text-xs font-medium truncate transition-colors ${isViewable(doc.mime_type) ? 'text-slate-700 dark:text-slate-300 group-hover/doc:text-indigo-600 dark:group-hover/doc:text-indigo-400' : 'text-slate-700 dark:text-slate-300'}`}>
                                        {doc.original_filename}
                                    </p>
                                    <p className="text-[10px] text-slate-400 dark:text-slate-600">
                                        {formatBytes(doc.file_size)}
                                        {doc.uploaded_at && ` · ${new Date(doc.uploaded_at).toLocaleDateString('de-DE')}`}
                                        {isViewable(doc.mime_type) && <span className="ml-1 text-indigo-400">· Klicken zum Öffnen</span>}
                                    </p>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-1 opacity-0 group-hover/doc:opacity-100 transition-opacity">
                                    {isViewable(doc.mime_type) && (
                                        <button
                                            onClick={() => setViewerDoc(doc)}
                                            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-all cursor-pointer"
                                            title="Anzeigen"
                                        >
                                            <Eye className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                    <a
                                        href={`${apiBase}/jobs/${job.id}/documents/${doc.id}/download`}
                                        download={doc.original_filename}
                                        className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-all cursor-pointer"
                                        title="Herunterladen"
                                        onClick={e => e.stopPropagation()}
                                    >
                                        <Download className="w-3.5 h-3.5" />
                                    </a>
                                    <button
                                        onClick={() => deleteDocument(doc.id)}
                                        className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all cursor-pointer"
                                        title="Löschen"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="mt-3 text-xs text-center text-slate-400 dark:text-slate-600">Noch keine Dateien hochgeladen</p>
                )}
            </section>
        </div>
    );
}
