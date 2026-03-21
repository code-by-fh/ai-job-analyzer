import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import {
    Brain, Clock, ExternalLink, FileText, MessageSquare,
    CalendarDays, StickyNote, Archive, ChevronDown, ChevronUp,
    Search, Mail, Handshake, Trophy, PartyPopper,
    XCircle, AlertTriangle, Sparkles
} from 'lucide-react';
import { fetchWithAuth } from '../AuthProvider';
import * as LucideIcons from 'lucide-react';

const DynamicIcon = ({ name, className }: { name: string; className?: string }) => {
    const IconComponent = (LucideIcons as any)[name];
    if (!IconComponent) return null;
    return <IconComponent className={className} />;
};
import { useLanguage } from '../LanguageProvider';
import { STATUS_META, STATUS_PIPELINE } from './constants';
import type { Job } from '../../lib/types';
import type { JobStatus } from '../JobStatusBadge';

interface JobOverviewTabProps {
    job: Job;
    onTabChange: (tab: 'overview' | 'application' | 'interview' | 'company' | 'status' | 'documents' | null) => void;
    onStatusUpdate?: (jobId: string, status: JobStatus) => void;
    onArchive?: (jobId: string) => void;
}

export default function JobOverviewTab({ job, onTabChange, onStatusUpdate, onArchive }: JobOverviewTabProps) {
    const { t } = useLanguage();
    const [isStatusOpen, setIsStatusOpen] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analyzeError, setAnalyzeError] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const LS_KEY = `analyzing_${job.id}`;

    // Restore analyzing state from localStorage on mount (survives refresh)
    useEffect(() => {
        if (!job.reasoning && localStorage.getItem(LS_KEY)) {
            setIsAnalyzing(true);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Elapsed timer while analyzing
    useEffect(() => {
        if (!isAnalyzing) {
            if (timerRef.current) clearInterval(timerRef.current);
            setElapsed(0);
            return;
        }
        const stored = localStorage.getItem(LS_KEY);
        const startTime = stored ? parseInt(stored) : Date.now();
        if (!stored) localStorage.setItem(LS_KEY, startTime.toString());
        setElapsed(Math.floor((Date.now() - startTime) / 1000));
        timerRef.current = setInterval(() => {
            setElapsed(Math.floor((Date.now() - startTime) / 1000));
        }, 1000);
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAnalyzing]);

    // Auto-clear loading state when reasoning arrives via prop update (WebSocket) or on mount
    useEffect(() => {
        if (job.reasoning) {
            localStorage.removeItem(LS_KEY);
            setIsAnalyzing(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [job.reasoning]);

    const handleTriggerAnalysis = async () => {
        setAnalyzeError(false);
        localStorage.setItem(LS_KEY, Date.now().toString());
        setIsAnalyzing(true);
        try {
            await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/jobs/${job.id}/analyze`, { method: 'POST' });
        } catch {
            setAnalyzeError(true);
            localStorage.removeItem(LS_KEY);
            setIsAnalyzing(false);
        }
    };

    const formatElapsed = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

    const statusMeta = STATUS_META[job.status || 'OPEN'] || STATUS_META['OPEN'];
    const score = Math.round(job.match_score);
    const scoreColor = score >= 80 ? 'bg-emerald-500' : score >= 50 ? 'bg-amber-500' : 'bg-rose-500';
    const scoreTextColor = score >= 80 ? 'text-emerald-600 dark:text-emerald-400' : score >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400';

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsStatusOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const ALL_STATUS_KEYS = [...STATUS_PIPELINE, 'REJECTED', 'FAILED'] as JobStatus[];

    // ── LOADING STATE (consistent with JobApplicationTab) ──
    if (isAnalyzing) {
        return (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
                <div className="relative">
                    <div className="absolute inset-0 bg-indigo-500 blur-xl opacity-20 animate-pulse"></div>
                    <Brain className="w-10 h-10 text-indigo-500 animate-pulse relative z-10" />
                </div>
                <div className="text-center animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <p className="text-base font-semibold text-slate-800 dark:text-slate-200">{t('triggerAnalysis')}…</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400 tabular-nums">{formatElapsed(elapsed)}</p>
                </div>
                <button
                    onClick={() => {
                        setIsAnalyzing(false);
                        localStorage.removeItem(LS_KEY);
                        if (timerRef.current) clearInterval(timerRef.current);
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 rounded-xl transition-all cursor-pointer"
                >
                    <XCircle className="w-3.5 h-3.5" />
                    {t('cancel' as any) || 'Abbrechen'}
                </button>
            </div>
        );
    }

    // ── EMPTY STATE (consistent with JobApplicationTab) ──
    if (!job.reasoning) {
        return (
            <div className="group relative flex flex-col items-center justify-center py-16 gap-6 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl transition-all hover:border-indigo-400 dark:hover:border-indigo-500/50 bg-slate-50/50 dark:bg-slate-900/20 w-full">
                <div className="w-16 h-16 bg-white dark:bg-slate-800 rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform duration-300">
                    <Brain className="w-8 h-8 text-indigo-500" />
                </div>
                <div className="text-center px-6 max-w-sm space-y-2">
                    <p className="text-lg font-bold text-slate-800 dark:text-slate-200">{t('analysis') || 'KI-Analyse'}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        {t('firstRunNotice')}
                    </p>
                    {analyzeError && (
                        <p className="text-xs text-rose-500 mt-2">{t('genericError')}</p>
                    )}
                </div>
                <button
                    onClick={handleTriggerAnalysis}
                    className="group flex items-center gap-2 px-8 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-sm font-bold shadow-lg shadow-indigo-500/20 transition-all hover:-translate-y-0.5 cursor-pointer"
                >
                    {t('triggerAnalysis')}
                    <Sparkles className="w-4 h-4" />
                </button>
            </div>
        );
    }

    if (job.reasoning && !isExpanded) {
        return (
            <div
                onClick={() => setIsExpanded(true)}
                className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-all duration-200"
            >
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 sm:gap-4">
                    {/* Score*/}
                    <div className="flex items-center h-10 gap-3 bg-white dark:bg-slate-800 px-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                        <span className={`text-lg font-black ${scoreTextColor} tracking-tighter`}>{score}%</span>
                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest border-l border-slate-200 dark:border-slate-700 pl-3">Match</span>
                    </div>

                    {/* Status*/}
                    <span className={`inline-flex items-center h-10 gap-2 px-4 rounded-xl border text-[10px] font-black uppercase tracking-wider ${statusMeta.pillCls} shadow-sm`}>
                        <DynamicIcon name={statusMeta.icon} className="w-3.5 h-3.5" />
                        {t(statusMeta.labelKey)}
                    </span>

                    {/* Date */}
                    {job.created_at && (
                        <div className="flex items-center h-10 gap-2.5 px-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest shadow-sm">
                            <CalendarDays className="w-3.5 h-3.5 text-slate-400" />
                            <span>{new Date(job.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                        </div>
                    )}
                </div>

                {/* Plain Button*/}
                <div className="flex items-center h-10 gap-2 px-6 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-black uppercase tracking-[0.2em] shadow-md shadow-indigo-500/10 transition-all">
                    {t('viewDetails') || 'Analyse anzeigen'}
                    <ChevronDown className="w-4 h-4" />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4 animate-in fade-in zoom-in-95 duration-300">
            <div className="flex flex-col sm:flex-row gap-4">

                {/* ── KI-ANALYSE (CONTENT) ── */}
                <div className="flex-1 min-w-0 bg-slate-50 dark:bg-slate-950/40 p-4 rounded-xl border border-slate-100 dark:border-slate-800/50">
                    <div className="flex items-center gap-2 mb-2.5">
                        <Brain className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                        <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                            {t('analysis') || 'AI Analysis'}
                        </span>
                    </div>
                    <div className="prose prose-sm dark:prose-invert max-w-none text-slate-700 dark:text-slate-200 leading-relaxed">
                        <ReactMarkdown>{job.reasoning}</ReactMarkdown>
                    </div>
                </div>

                {/* ── KURZÜBERSICHT ── */}
                <div className="w-full sm:w-52 flex-shrink-0 space-y-3">

                    {/* Match score bar */}
                    <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800 p-3">
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Match</span>
                            <span className={`text-sm font-black ${scoreTextColor}`}>{score}%</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-500 ${scoreColor}`} style={{ width: `${score}%` }} />
                        </div>
                    </div>

                    {/* Status */}
                    <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800 p-3 space-y-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Status</span>

                        {onStatusUpdate ? (
                            <div className="relative" ref={dropdownRef}>
                                <button
                                    onClick={() => setIsStatusOpen(!isStatusOpen)}
                                    className={`flex items-center justify-between w-full pl-3 pr-2.5 py-1.5 text-xs font-bold rounded-full border cursor-pointer transition-all hover:shadow-md active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${statusMeta.pillCls}`}
                                >
                                    <div className="flex items-center gap-2">
                                        <DynamicIcon name={statusMeta.icon} className="w-3.5 h-3.5" />
                                        <span>{t(statusMeta.labelKey)}</span>
                                    </div>
                                    <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ${isStatusOpen ? 'rotate-180' : ''}`} />
                                </button>

                                {isStatusOpen && (
                                    <div className="absolute left-0 right-0 mt-2 p-1 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl shadow-slate-200/50 dark:shadow-black/40 z-[100] transition-all duration-200 ease-out animate-dropdown-fade">
                                        <div className="max-h-60 overflow-y-auto custom-scrollbar overflow-x-hidden">
                                            {ALL_STATUS_KEYS.map(s => {
                                                const meta = STATUS_META[s];
                                                const isActive = (job.status || 'OPEN') === s;
                                                return (
                                                    <button
                                                        key={s}
                                                        onClick={() => {
                                                            onStatusUpdate(job.id, s);
                                                            setIsStatusOpen(false);
                                                        }}
                                                        className={`flex items-center gap-2.5 w-full px-2.5 py-2 rounded-xl text-[11px] font-bold transition-all
                                                            ${isActive
                                                                ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                                                                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-200'}`}
                                                    >
                                                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center border transition-colors
                                                            ${isActive
                                                                ? 'bg-white dark:bg-slate-800 border-indigo-200 dark:border-indigo-500/30 text-indigo-500'
                                                                : 'bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-700/50 text-slate-400'}`}>
                                                            <DynamicIcon name={meta.icon} className="w-3.5 h-3.5" />
                                                        </div>
                                                        <span className="flex-1 text-left">{t(meta.labelKey)}</span>
                                                        {isActive && <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 ring-4 ring-indigo-500/20" />}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border ${statusMeta.pillCls}`}>
                                <DynamicIcon name={statusMeta.icon} className="w-3.5 h-3.5" /> {t(statusMeta.labelKey)}
                            </span>
                        )}

                        {/* Checklist items */}
                        <div className="space-y-1.5 pt-1 border-t border-slate-100 dark:border-slate-700/50">
                            <CheckItem
                                icon={<FileText className="w-3 h-3" />}
                                label={t('application') || 'Application'}
                                done={!!job.application_draft}
                                onClick={() => onTabChange('application')}
                            />
                            <CheckItem
                                icon={<MessageSquare className="w-3 h-3" />}
                                label={t('interviewPrep') || 'Interview Prep'}
                                done={!!job.interview_prep_material}
                                onClick={() => onTabChange('interview')}
                            />
                        </div>
                    </div>

                    {/* Meta infos */}
                    <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800 p-3 space-y-2">
                        {job.next_follow_up_at && (
                            <div className="flex items-center gap-2 text-xs">
                                <Clock className="w-3 h-3 text-amber-500 flex-shrink-0" />
                                <span className="text-amber-600 dark:text-amber-400 font-semibold">
                                    {new Date(job.next_follow_up_at).toLocaleDateString('en-US')}
                                </span>
                            </div>
                        )}
                        {job.created_at && (
                            <div className="flex items-center gap-2 text-xs text-slate-400">
                                <CalendarDays className="w-3 h-3 flex-shrink-0" />
                                <span>{new Date(job.created_at).toLocaleDateString('en-US')}</span>
                            </div>
                        )}
                        {job.url && (
                            <a href={job.url} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-2 text-xs text-indigo-500 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-semibold transition-colors truncate"
                            >
                                <ExternalLink className="w-3 h-3 flex-shrink-0" />
                                <span className="truncate">{new URL(job.url).hostname.replace('www.', '')}</span>
                            </a>
                        )}
                        {job.notes && (
                            <div className="flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-700/50">
                                <StickyNote className="w-3 h-3 flex-shrink-0 mt-0.5" />
                                <span className="line-clamp-3">{job.notes}</span>
                            </div>
                        )}
                    </div>

                    {/* Archive Button */}
                    {onArchive && (
                        <button
                            onClick={() => onArchive(job.id)}
                            className="w-full h-8 flex items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-800/50 text-slate-400 hover:text-rose-500 hover:border-rose-200 dark:hover:border-rose-500/30 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all text-[10px] font-black uppercase tracking-widest cursor-pointer group"
                        >
                            <Archive className="w-3 h-3 transition-transform group-hover:scale-110" />
                            <span>{t('archiveJob') || 'Archive'}</span>
                        </button>
                    )}

                    {/* Collapse Button */}
                    {isExpanded && (
                        <button
                            onClick={() => setIsExpanded(false)}
                            className="w-full h-8 flex items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700/50 bg-slate-50 dark:bg-slate-900/50 text-slate-400 hover:text-indigo-500 hover:border-indigo-200 dark:hover:border-indigo-500/30 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-all text-[10px] font-black uppercase tracking-widest cursor-pointer group/close"
                        >
                            <ChevronUp className="w-3 h-3 transition-transform group-hover/close:-translate-y-0.5" />
                            <span>{t('closeDetails') || 'Collapse'}</span>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

function CheckItem({ icon, label, done, onClick }: { icon: React.ReactNode; label: string; done: boolean; onClick?: () => void }) {
    return (
        <button
            onClick={onClick}
            className="flex items-center gap-2 w-full text-left rounded-lg px-1 py-0.5 -mx-1 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors cursor-pointer group/ci"
        >
            <div className={`flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center transition-colors
                ${done ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500 group-hover/ci:bg-indigo-100 dark:group-hover/ci:bg-indigo-500/20 group-hover/ci:text-indigo-500'}`}>
                {done
                    ? <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    : <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600 group-hover/ci:bg-indigo-400 block transition-colors" />
                }
            </div>
            <span className={`text-[11px] font-medium transition-colors ${done ? 'text-slate-600 dark:text-slate-300' : 'text-slate-400 dark:text-slate-500 group-hover/ci:text-indigo-600 dark:group-hover/ci:text-indigo-400'}`}>
                {label}
            </span>
            <svg className="w-3 h-3 ml-auto opacity-0 group-hover/ci:opacity-60 text-slate-400 dark:text-slate-500 transition-opacity flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
        </button>
    );
}
