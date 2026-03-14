import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Brain, Clock, ExternalLink, FileText, MessageSquare, CalendarDays, StickyNote } from 'lucide-react';
import { useLanguage } from '../LanguageProvider';
import { STATUS_META } from './constants';
import type { Job } from '../../lib/types';

interface JobOverviewTabProps {
    job: Job;
    onTabChange: (tab: 'overview' | 'application' | 'interview' | 'company' | 'status' | 'documents' | null) => void;
}

export default function JobOverviewTab({ job, onTabChange }: JobOverviewTabProps) {
    const { t } = useLanguage();
    const statusMeta = STATUS_META[job.status || 'OPEN'] || STATUS_META['OPEN'];
    const score = Math.round(job.match_score);
    const scoreColor = score >= 80 ? 'bg-emerald-500' : score >= 50 ? 'bg-amber-500' : 'bg-rose-500';
    const scoreTextColor = score >= 80 ? 'text-emerald-600 dark:text-emerald-400' : score >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400';

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">

                {/* ── KI-ANALYSE ── */}
                <div className="flex-1 min-w-0 bg-slate-50 dark:bg-slate-950/40 p-4 rounded-xl border border-slate-100 dark:border-slate-800/50">
                    <div className="flex items-center gap-2 mb-2.5">
                        <Brain className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                        <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                            {t('analysis') || 'KI-Analyse'}
                        </span>
                    </div>
                    <div className="prose prose-sm dark:prose-invert max-w-none text-slate-700 dark:text-slate-200 leading-relaxed">
                        <ReactMarkdown>{job.reasoning || ''}</ReactMarkdown>
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
                        <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border ${statusMeta.pillCls}`}>
                            {statusMeta.icon} {statusMeta.label}
                        </span>

                        {/* Checklist items */}
                        <div className="space-y-1.5 pt-1 border-t border-slate-100 dark:border-slate-700/50">
                            <CheckItem
                                icon={<FileText className="w-3 h-3" />}
                                label={t('application') || 'Bewerbung'}
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
                                    {new Date(job.next_follow_up_at).toLocaleDateString('de-DE')}
                                </span>
                            </div>
                        )}
                        {job.created_at && (
                            <div className="flex items-center gap-2 text-xs text-slate-400">
                                <CalendarDays className="w-3 h-3 flex-shrink-0" />
                                <span>{new Date(job.created_at).toLocaleDateString('de-DE')}</span>
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
