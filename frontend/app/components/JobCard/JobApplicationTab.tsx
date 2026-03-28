import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { Check, Copy, Download, FileText, Loader2, Edit2, X, Save, RefreshCw, Zap } from 'lucide-react';
import RegenBanner from './RegenBanner';
import { useLanguage } from '../LanguageProvider';
import type { Job } from '../../lib/types';
import type { JobStatus } from '../JobStatusBadge';
import { fetchWithAuth } from '../AuthProvider';

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

const formatElapsed = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

const GENERATION_PHASES = [
    { label: 'Stellenanzeige analysieren…', icon: '🔍' },
    { label: 'Profil abgleichen…', icon: '📋' },
    { label: 'Stärken herausarbeiten…', icon: '💡' },
    { label: 'Einleitung formulieren…', icon: '✍️' },
    { label: 'Mehrwert herausarbeiten…', icon: '🎯' },
    { label: 'Abschluss verfassen…', icon: '✅' },
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
    const [copied, setCopied] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [draftContent, setDraftContent] = useState(job.application_draft || '');
    const [isSaving, setIsSaving] = useState(false);
    const [showRegenInput, setShowRegenInput] = useState(false);
    const [regenNote, setRegenNote] = useState('');
    const [isSubmittingRegen, setIsSubmittingRegen] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    const [phaseIndex, setPhaseIndex] = useState(0);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const phaseRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Elapsed timer + phase rotation while generating
    useEffect(() => {
        if (!isGenerating) {
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
            setPhaseIndex(i => (i + 1) % GENERATION_PHASES.length);
        }, 3500);
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            if (phaseRef.current) clearInterval(phaseRef.current);
        };
    }, [isGenerating, job.id]);

    // Clear localStorage when done
    useEffect(() => {
        if (!isGenerating && job.application_draft) {
            localStorage.removeItem(`gen_app_${job.id}`);
        }
    }, [isGenerating, job.application_draft, job.id]);

    const handleCopy = () => {
        if (!job.application_draft) return;
        navigator.clipboard.writeText(job.application_draft);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleDownload = async () => {
        try {
            const baseUrl = apiBase.endsWith('/') ? apiBase.slice(0, -1) : apiBase;
            const res = await fetchWithAuth(`${baseUrl}/jobs/${encodeURIComponent(job.id)}/download`);
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.detail || 'Download failed');
            }
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Bewerbung_${job.company.replace(/\s+/g, '_')}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            if (job.status === 'OPEN' || job.status === 'DRAFTED' || !job.status) {
                onStatusUpdate(job.id, 'APPLIED');
            }
        } catch (e: any) {
            console.error('PDF download error:', e);
            alert(t('downloadFailed') + ': ' + (e.message || 'Unknown error'));
        }
    };

    const handleEditStart = () => {
        setDraftContent(job.application_draft || '');
        setIsEditing(true);
    };

    const handleEditCancel = () => {
        setDraftContent(job.application_draft || '');
        setIsEditing(false);
    };

    const handleSave = async () => {
        if (!onUpdateJob) return;
        setIsSaving(true);
        try {
            await onUpdateJob(job.id, { application_draft: draftContent });
            setIsEditing(false);
        } catch (e) {
            console.error('Save error:', e);
        } finally {
            setIsSaving(false);
        }
    };

    const handleRegenerate = async () => {
        setIsSubmittingRegen(true);
        setShowRegenInput(false);
        localStorage.setItem(`gen_app_${job.id}`, Date.now().toString());
        try {
            if (onRegenerate) {
                await onRegenerate(job, regenNote);
            } else {
                const baseUrl = apiBase.endsWith('/') ? apiBase.slice(0, -1) : apiBase;
                await fetchWithAuth(`${baseUrl}/jobs/${job.id}/generate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ improvement_notes: regenNote || null }),
                });
            }
            setRegenNote('');
        } catch (e) {
            localStorage.removeItem(`gen_app_${job.id}`);
            console.error('Regenerate error:', e);
        } finally {
            setIsSubmittingRegen(false);
        }
    };

    const handleCancel = async () => {
        if (onCancelGenerate) {
            await onCancelGenerate(job.id);
        } else {
            try {
                const baseUrl = apiBase.endsWith('/') ? apiBase.slice(0, -1) : apiBase;
                await fetchWithAuth(`${baseUrl}/jobs/${job.id}/cancel-generation`, { method: 'POST' });
            } catch {}
        }
        localStorage.removeItem(`gen_app_${job.id}`);
    };

    // First-time generation (no existing draft) → full spinner
    if (isGenerating && !job.application_draft) {
        const phase = GENERATION_PHASES[phaseIndex];
        return (
            <div className="flex-1 flex flex-col items-center justify-center py-14 gap-6">
                {/* Animated spinner ring */}
                <div className="relative w-20 h-20 flex items-center justify-center">
                    <div className="absolute inset-0 rounded-full border-4 border-indigo-100 dark:border-indigo-500/20" />
                    <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-indigo-500 animate-spin" />
                    <span className="text-2xl">{phase.icon}</span>
                </div>

                {/* Phase label */}
                <div className="text-center space-y-1">
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200 transition-all duration-500">
                        {phase.label}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">{formatElapsed(elapsed)}</p>
                </div>

                {/* Phase step indicators */}
                <div className="flex gap-1.5">
                    {GENERATION_PHASES.map((p, i) => (
                        <div
                            key={i}
                            className={`h-1.5 rounded-full transition-all duration-500 ${
                                i === phaseIndex
                                    ? 'w-6 bg-indigo-500'
                                    : i < phaseIndex
                                    ? 'w-1.5 bg-indigo-300 dark:bg-indigo-600'
                                    : 'w-1.5 bg-slate-200 dark:bg-slate-700'
                            }`}
                        />
                    ))}
                </div>

                <button
                    onClick={handleCancel}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 rounded-xl transition-all cursor-pointer"
                >
                    <X className="w-3.5 h-3.5" />
                    Abbrechen
                </button>
            </div>
        );
    }

    // Regeneration banner (shown inline above the existing draft)
    const regenPhase = GENERATION_PHASES[phaseIndex];
    const regenBanner = isGenerating
        ? <RegenBanner label={regenPhase.label} icon={regenPhase.icon} elapsed={elapsed} onCancel={handleCancel} phaseCount={GENERATION_PHASES.length} phaseIndex={phaseIndex} />
        : null;

    return (
        <div className="space-y-6 flex-1 flex flex-col">
            {job.application_draft ? (
                <div className="space-y-4">
                    {regenBanner}
                    <div className="flex flex-wrap items-center gap-2 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                            <FileText className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">Bewerbungsschreiben</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                            {!isEditing && !isGenerating && (
                                <button
                                    onClick={() => setShowRegenInput(v => !v)}
                                    className={`p-2 rounded-lg transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer whitespace-nowrap ${
                                        showRegenInput
                                            ? 'text-purple-600 bg-purple-100 dark:bg-purple-500/20'
                                            : 'text-slate-500 hover:text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-500/10'
                                    }`}
                                    title="Neu generieren"
                                >
                                    <RefreshCw className="w-3.5 h-3.5" />
                                    <span className="hidden sm:inline">Neu generieren</span>
                                </button>
                            )}
                            {!isEditing && !isGenerating && (
                                <button
                                    onClick={handleEditStart}
                                    className="p-2 text-slate-500 hover:text-indigo-500 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer whitespace-nowrap"
                                >
                                    <Edit2 className="w-3.5 h-3.5" />
                                    <span className="hidden sm:inline">{t('edit' as any) || 'Bearbeiten'}</span>
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
                                        <span className="hidden sm:inline">{t('cancel' as any) || 'Abbrechen'}</span>
                                    </button>
                                    <button
                                        onClick={handleSave}
                                        disabled={isSaving}
                                        className="p-2 text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer shadow-sm shadow-emerald-500/20 whitespace-nowrap disabled:opacity-50"
                                    >
                                        {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                        <span className="hidden sm:inline">{t('save' as any) || 'Speichern'}</span>
                                    </button>
                                </>
                            )}
                            {!isEditing && !isGenerating && (
                                <>
                                    <button
                                        onClick={handleCopy}
                                        className="p-2 text-slate-500 hover:text-indigo-500 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer whitespace-nowrap"
                                    >
                                        {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                                        <span className="hidden sm:inline">{copied ? 'Kopiert' : (t('copyText') || 'Kopieren')}</span>
                                    </button>
                                    <button
                                        onClick={handleDownload}
                                        className="p-2 text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer shadow-sm shadow-indigo-500/20 whitespace-nowrap"
                                    >
                                        <Download className="w-3.5 h-3.5" />
                                        <span>{t('saveAsPdf') || 'PDF'}</span>
                                    </button>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Regenerate input panel */}
                    {showRegenInput && !isEditing && (
                        <div className="bg-purple-50 dark:bg-purple-500/5 border border-purple-200 dark:border-purple-500/20 rounded-xl p-4 space-y-3">
                            <p className="text-xs font-bold text-purple-700 dark:text-purple-300 uppercase tracking-wider">Verbesserungshinweis (optional)</p>
                            <textarea
                                value={regenNote}
                                onChange={e => setRegenNote(e.target.value)}
                                placeholder="Z.B. 'Mehr auf meine Python-Erfahrung eingehen' oder 'Formeller schreiben'"
                                className="w-full min-h-[80px] text-sm bg-white dark:bg-slate-800 border border-purple-200 dark:border-purple-500/30 rounded-lg p-3 text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-400 resize-y"
                            />
                            <div className="flex gap-2 justify-end">
                                <button
                                    onClick={() => { setShowRegenInput(false); setRegenNote(''); }}
                                    className="px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-all cursor-pointer"
                                >
                                    Abbrechen
                                </button>
                                <button
                                    onClick={handleRegenerate}
                                    disabled={isSubmittingRegen}
                                    className="px-4 py-1.5 text-xs font-bold text-white bg-purple-600 hover:bg-purple-500 rounded-lg transition-all shadow-sm cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                                >
                                    {isSubmittingRegen
                                        ? <><Loader2 className="w-3 h-3 animate-spin" /> Wird gestartet…</>
                                        : <><RefreshCw className="w-3 h-3" /> Neu generieren</>
                                    }
                                </button>
                            </div>
                        </div>
                    )}

                    {isEditing ? (
                        <div className="bg-white dark:bg-slate-800 p-4 md:p-6 rounded-2xl border-2 border-indigo-200 dark:border-indigo-500/30 shadow-lg relative">
                            <textarea
                                value={draftContent}
                                onChange={(e) => setDraftContent(e.target.value)}
                                className="w-full min-h-[500px] bg-transparent border-0 focus:ring-0 p-0 text-slate-700 dark:text-slate-200 font-serif leading-relaxed text-sm md:text-base resize-y"
                                placeholder="Bewerbungsschreiben hier bearbeiten..."
                            />
                        </div>
                    ) : (
                        <div className={`bg-white dark:bg-slate-800 p-8 md:p-10 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-lg font-serif relative transition-opacity duration-300 ${isGenerating ? 'opacity-40 pointer-events-none select-none' : ''}`}>
                            <div className="prose prose-sm md:prose-base dark:prose-invert max-w-none prose-p:text-slate-700 dark:prose-p:text-slate-200 prose-headings:text-slate-900 dark:prose-headings:text-white leading-relaxed">
                                <ReactMarkdown>{job.application_draft}</ReactMarkdown>
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <div className="group relative flex-1 flex flex-col items-center justify-center py-16 gap-6 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl transition-all hover:border-indigo-400 dark:hover:border-indigo-500/50 bg-slate-50/50 dark:bg-slate-900/20">
                    <div className="w-16 h-16 bg-white dark:bg-slate-800 rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform duration-300">
                        <FileText className="w-8 h-8 text-indigo-500" />
                    </div>
                    <div className="text-center px-6 max-w-sm space-y-2">
                        <p className="text-lg font-bold text-slate-800 dark:text-slate-200">Bewerbungsschreiben</p>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            KI-generiertes und auf dich abgestimmtes Anschreiben basierend auf deinem Profil.
                        </p>
                    </div>
                    <button
                        onClick={() => onGenerate(job)}
                        disabled={isGenerating}
                        className="group flex items-center gap-2 px-8 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-sm font-bold shadow-lg shadow-indigo-500/20 transition-all hover:-translate-y-0.5 cursor-pointer disabled:opacity-50"
                    >
                        {t('generateApplication') || 'Bewerbung generieren'}
                        <Zap className="w-4 h-4" />
                    </button>
                </div>
            )}
        </div>
    );
}
