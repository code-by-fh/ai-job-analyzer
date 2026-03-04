import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Loader2 } from 'lucide-react';
import { Job } from '../lib/types';
import { useLanguage } from './LanguageProvider';
import JobStatusBadge, { JobStatus } from './JobStatusBadge';

interface JobCardProps {
    job: Job;
    isExpanded: boolean;
    isGenerating: boolean;
    onToggleExpand: (jobId: string) => void;
    onGenerate: (job: Job) => void;
    onStatusUpdate: (jobId: string, status: JobStatus) => void;
    onToggleFavorite: (jobId: string, currentStatus: boolean) => void;
    isSelected?: boolean;
    onSelect?: (jobId: string, selected: boolean) => void;
}

export default function JobCard({
    job,
    isExpanded,
    isGenerating,
    onToggleExpand,
    onGenerate,
    onStatusUpdate,
    onToggleFavorite,
    isSelected = false,
    onSelect
}: JobCardProps) {
    const { t } = useLanguage();

    const timeAgo = (dateString?: string) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        const now = new Date();
        const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
        let interval = seconds / 86400;
        if (interval > 1) return Math.floor(interval) + t('dayUnit');
        interval = seconds / 3600;
        if (interval > 1) return Math.floor(interval) + t('hourUnit');
        interval = seconds / 60;
        if (interval > 1) return Math.floor(interval) + t('minUnit');
        return t('now');
    };

    const getScoreColor = (score: number) => {
        if (score >= 80) return 'text-emerald-500 dark:text-emerald-400 border-emerald-500/50';
        if (score >= 50) return 'text-amber-500 dark:text-amber-400 border-amber-500/50';
        return 'text-rose-500 dark:text-rose-400 border-rose-500/50';
    };

    const scoreClass = getScoreColor(job.match_score);

    return (
        <div
            className={`
        group relative rounded-2xl border transition-all duration-300 hover:z-30
        ${isExpanded
                    ? 'bg-white dark:bg-slate-900 border-indigo-500/30 dark:border-indigo-500/50 shadow-2xl dark:shadow-[0_0_40px_rgba(0,0,0,0.4)] z-20'
                    : isSelected
                        ? 'bg-indigo-50/50 dark:bg-indigo-900/20 border-indigo-300 dark:border-indigo-700 shadow-md'
                        : 'bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-lg dark:hover:shadow-none'
                }
      `}
        >
            {/* Glow Effect (Dark Mode) */}
            <div className={`absolute inset-0 rounded-2xl bg-gradient-to-r from-indigo-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none ${isExpanded ? 'opacity-100' : ''}`} />



            <div className="p-6 sm:p-8 flex flex-col sm:flex-row gap-8 relative z-10">
                {/* Match Score Indicator - Enhanced */}
                <div className="flex-shrink-0 pt-1">
                    <div className={`
            relative w-20 h-20 rounded-2xl flex flex-col items-center justify-center border-2 
            backdrop-blur-sm transition-all duration-300 group-hover:scale-105
            ${scoreClass}
            ${job.match_score >= 80
                            ? 'bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-500/20 dark:to-teal-500/20 shadow-lg shadow-emerald-500/20 dark:shadow-emerald-500/40'
                            : job.match_score >= 50
                                ? 'bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-500/20 dark:to-orange-500/20 shadow-lg shadow-amber-500/20 dark:shadow-amber-500/40'
                                : 'bg-gradient-to-br from-rose-50 to-pink-50 dark:from-rose-500/20 dark:to-pink-500/20 shadow-lg shadow-rose-500/20 dark:shadow-rose-500/40'
                        }
           `}>
                        <span className="text-2xl font-black tracking-tight">{Math.round(job.match_score)}</span>
                        <span className="text-[9px] uppercase font-bold opacity-80 tracking-wider">{t('match')}</span>
                        {/* Glow ring effect */}
                        <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 animate-pulse"
                            style={{
                                boxShadow: job.match_score >= 80
                                    ? '0 0 20px rgba(16, 185, 129, 0.4)'
                                    : job.match_score >= 50
                                        ? '0 0 20px rgba(245, 158, 11, 0.4)'
                                        : '0 0 20px rgba(244, 63, 94, 0.4)'
                            }} />
                    </div>
                </div>

                <div className="flex-grow min-w-0">
                    <div className="flex justify-between items-start mb-3 gap-4">
                        <div className="min-w-0 flex-1">
                            <h2 className="text-xl font-bold text-slate-900 dark:text-white leading-tight mb-1 line-clamp-2" title={job.title}>
                                {job.title}
                            </h2>
                            <div className="text-sm text-indigo-600 dark:text-indigo-400 font-semibold tracking-wide uppercase text-[10px]">
                                {job.company}
                            </div>
                        </div>
                        <div className="flex flex-col items-end gap-2 flex-shrink-0">
                            <div className="flex flex-row-reverse sm:flex-row items-center gap-3">
                                {onSelect && (
                                    <label className="relative flex items-center justify-center cursor-pointer group/cb">
                                        <input
                                            type="checkbox"
                                            className="peer sr-only"
                                            checked={isSelected}
                                            onChange={(e) => onSelect(job.id, e.target.checked)}
                                        />
                                        <div className={`w-[22px] h-[22px] rounded-md border-2 transition-all duration-200 flex items-center justify-center
                                            ${isSelected
                                                ? 'bg-indigo-500 border-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]'
                                                : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 group-hover/cb:border-indigo-400 dark:group-hover/cb:border-indigo-500 shadow-sm'
                                            }`}>
                                            <svg className={`w-3.5 h-3.5 text-white transition-transform duration-300 ${isSelected ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                            </svg>
                                        </div>
                                    </label>
                                )}
                                <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800/50 px-2 py-0.5 rounded-full border border-slate-200/50 dark:border-slate-700/30 whitespace-nowrap">
                                    {timeAgo(job.created_at)}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* AI Reasoning */}
                    <div className="mb-6 bg-slate-50 dark:bg-slate-950/40 p-5 rounded-xl border border-slate-100 dark:border-slate-800/50">
                        <div className="flex items-center gap-2 mb-3">
                            <span className="text-indigo-500 text-sm">✨</span>
                            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">{t('analysis')}</span>
                        </div>
                        <div className="prose prose-sm dark:prose-invert max-w-none text-slate-600 dark:text-slate-300 leading-relaxed">
                            <ReactMarkdown components={{ p: ({ node, ...props }) => <p className="mb-1 last:mb-0" {...props} /> }}>
                                {job.reasoning}
                            </ReactMarkdown>
                        </div>
                    </div>

                    {/* BUTTON CONTAINER - Modern Unified System */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-6 border-t border-slate-100 dark:border-slate-800/30 mt-4">
                        {/* MAIN ACTIONS GROUP */}
                        <div className="flex flex-col w-full sm:flex-row sm:flex-wrap sm:items-center gap-3 flex-1 px-1">
                            {job.url && (
                                <a href={job.url} target="_blank" rel="noopener noreferrer"
                                    className="group/apply relative h-[42px] min-w-[140px] px-5 bg-white dark:bg-slate-900/40 backdrop-blur-md border border-slate-200/60 dark:border-slate-700/40 text-slate-700 dark:text-slate-300 rounded-xl text-[11px] uppercase tracking-wider font-bold hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:border-slate-300 dark:hover:border-slate-600/60 shadow-sm hover:shadow-md dark:hover:shadow-indigo-500/10 transition-all duration-300 flex items-center justify-center gap-2 active:scale-95 shadow-none w-full sm:w-auto"
                                >
                                    <span className="text-sm group-hover/apply:translate-x-0.5 group-hover/apply:-translate-y-0.5 transition-transform duration-300">↗</span>
                                    <span>{t('applySource')}</span>
                                </a>
                            )}

                            <button
                                onClick={() => onGenerate(job)}
                                disabled={isGenerating}
                                className={`
                  group/generate relative h-[42px] min-w-[180px] px-6 rounded-xl text-[11px] uppercase tracking-wider font-bold transition-all duration-300 flex items-center justify-center gap-2 overflow-hidden active:scale-95 w-full sm:w-auto
                  ${job.status === 'FAILED'
                                        ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30'
                                        : job.application_draft
                                            ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30'
                                            : 'bg-indigo-600 text-white border border-indigo-500 hover:bg-indigo-500 shadow-[0_4px_12px_rgba(79,70,229,0.3)] dark:shadow-[0_4px_20px_rgba(79,70,229,0.2)]'}
                  disabled:opacity-50 disabled:cursor-not-allowed
                `}
                            >
                                <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 group-hover/generate:opacity-100 transition-opacity duration-300 cursor-pointer" />
                                <span className="text-sm">
                                    {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> :
                                        job.status === 'FAILED' ? '⚠️' :
                                            job.application_draft ? '✓' : '⚡'}
                                </span>
                                <span>
                                    {isGenerating ? t('processing') :
                                        job.status === 'FAILED' ? t('failedRetry') :
                                            job.application_draft ? t('viewApplication') : t('generateApplication')}
                                </span>
                            </button>

                            <JobStatusBadge
                                status={job.status || 'OPEN'}
                                onStatusChange={(newStatus) => onStatusUpdate(job.id, newStatus)}
                                size="large"
                            />
                        </div>

                        {/* META ACTIONS GROUP */}
                        <div className="flex items-center gap-1.5 sm:border-l sm:border-slate-200/60 sm:dark:border-slate-800/60 sm:pl-4">
                            <button
                                onClick={() => onToggleFavorite(job.id, job.is_favorite || false)}
                                className={`
                  w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-200 active:scale-90 cursor-pointer
                  ${job.is_favorite
                                        ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-500 border border-amber-200 dark:border-amber-500/30'
                                        : 'bg-slate-50 dark:bg-slate-800/20 text-slate-400 border border-transparent hover:border-slate-200 dark:hover:border-slate-700/50 hover:bg-white dark:hover:bg-slate-800/40'}
                `}
                                title={job.is_favorite ? t('removeFromFavorites') : t('addToFavorites')}
                            >
                                {job.is_favorite ? '⭐' : '☆'}
                            </button>



                            <button onClick={() => onToggleExpand(job.id)}
                                className="px-4 py-2 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-sm font-medium transition-all duration-200 hover:bg-slate-100 dark:hover:bg-slate-800/50 rounded-lg cursor-pointer active:scale-95 flex items-center gap-1.5"
                            >
                                <span>{isExpanded ? t('closeDetails') : t('viewDetails')}</span>
                                <span className={`text-xs transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* DETAILS PANEL */}
            {isExpanded && (
                <div id={`job-details-${job.id}`} className="border-t border-slate-100 dark:border-slate-800/50 bg-slate-50/50 dark:bg-black/20 animate-in slide-in-from-top-4 duration-300">
                    <div className="p-8 sm:p-12">
                        <div className="prose prose-slate dark:prose-invert max-w-none">
                            <ReactMarkdown>{job.description}</ReactMarkdown>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
