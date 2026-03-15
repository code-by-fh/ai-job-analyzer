import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { 
    Brain, Clock, ExternalLink, FileText, MessageSquare, 
    CalendarDays, StickyNote, Archive, ChevronDown, 
    Search, Mail, Handshake, Trophy, PartyPopper, 
    XCircle, AlertTriangle 
} from 'lucide-react';
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
    const dropdownRef = useRef<HTMLDivElement>(null);

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

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">

                {/* ── KI-ANALYSE ── */}
                <div className="flex-1 min-w-0 bg-slate-50 dark:bg-slate-950/40 p-4 rounded-xl border border-slate-100 dark:border-slate-800/50">
                    <div className="flex items-center gap-2 mb-2.5">
                        <Brain className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                        <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                            {t('analysis') || 'AI Analysis'}
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
