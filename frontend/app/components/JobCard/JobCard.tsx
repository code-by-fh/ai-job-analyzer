import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { useLanguage } from '../LanguageProvider';
import type { Job } from '../../lib/types';
import type { JobStatus } from '../JobStatusBadge';
// ReactMarkdown kept for description toggle below

import { STATUS_META } from './constants';
import type { TabType, JobCardProps } from './types';

import JobOverviewTab from './JobOverviewTab';
import JobApplicationTab from './JobApplicationTab';
import JobInterviewTab from './JobInterviewTab';
import JobCompanyTab from './JobCompanyTab';
import JobStatusTab from './JobStatusTab';
import JobDocumentsTab from './JobDocumentsTab';

const TABS: { id: TabType & string; labelKey: string; labelFallback: string; shortLabel: string }[] = [
    { id: 'overview', labelKey: 'overview', labelFallback: 'Übersicht', shortLabel: 'Info' },
    { id: 'application', labelKey: 'application', labelFallback: 'Bewerbung', shortLabel: 'Bew.' },
    { id: 'interview', labelKey: 'interviewPrep', labelFallback: 'Interview', shortLabel: 'Int.' },
    { id: 'company', labelKey: 'companyProfile', labelFallback: 'Firma', shortLabel: 'Firma' },
    { id: 'status', labelKey: '', labelFallback: 'Status', shortLabel: 'Status' },
    { id: 'documents', labelKey: '', labelFallback: 'Unterlagen', shortLabel: 'Docs' },
];

export default function JobCard({
    job,
    isGenerating,
    onGenerate,
    onStatusUpdate,
    onToggleFavorite,
    isSelected = false,
    onSelect,
    onUpdateJob,
    apiBase = process.env.NEXT_PUBLIC_API_URL || '',
}: JobCardProps) {
    const { t } = useLanguage();
    const [activeTab, setActiveTab] = useState<TabType>('overview');

    const timeAgo = (dateString?: string) => {
        if (!dateString) return '';
        const diff = (Date.now() - new Date(dateString).getTime()) / 1000;
        if (diff > 86400) return Math.floor(diff / 86400) + (t('dayUnit') || 'd');
        if (diff > 3600) return Math.floor(diff / 3600) + (t('hourUnit') || 'h');
        if (diff > 60) return Math.floor(diff / 60) + (t('minUnit') || 'm');
        return t('now') || 'Jetzt';
    };

    const currentStatus = job.status || 'OPEN';
    const statusMeta = STATUS_META[currentStatus] || STATUS_META['OPEN'];

    return (
        <div className={`
            group relative rounded-2xl border overflow-hidden
            transition-all duration-300 hover:shadow-lg dark:hover:shadow-none hover:z-10
            ${isSelected
                ? 'bg-indigo-50/60 dark:bg-indigo-900/20 border-indigo-300 dark:border-indigo-700 shadow-md'
                : `bg-white dark:bg-slate-900 ${statusMeta.cardBorder || 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'}`
            }
        `}>
            {/* Subtle hover glow */}
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/3 to-purple-500/3 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

            {/* ── HEADER ── */}
            <div className="flex items-start gap-2 px-4 pt-4 pb-0 sm:px-5 sm:pt-5">

                {/* Title block */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                        {/* Title + company */}
                        <div className="min-w-0 flex-1">
                            <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-snug line-clamp-2 sm:line-clamp-1" title={job.title}>
                                {job.title}
                            </h2>
                            {job.url ? (
                                <a
                                    href={new URL(job.url).origin}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 font-semibold tracking-wide mt-0.5 hover:text-indigo-800 dark:hover:text-indigo-300 hover:underline transition-colors"
                                >
                                    {job.company_domain || job.company}
                                    <svg className="w-3 h-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                    </svg>
                                </a>
                            ) : (
                                <p className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold tracking-wide mt-0.5 truncate">
                                    {job.company_domain || job.company}
                                </p>
                            )}
                        </div>

                        {/* Actions: checkbox + favorite */}
                        <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
                            {onSelect && (
                                <label className="relative flex items-center justify-center cursor-pointer">
                                    <input type="checkbox" className="peer sr-only" checked={isSelected} onChange={e => onSelect(job.id, e.target.checked)} />
                                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all duration-200
                                        ${isSelected ? 'bg-indigo-500 border-indigo-500 shadow-sm shadow-indigo-500/30' : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 hover:border-indigo-400'}`}>
                                        <svg className={`w-3 h-3 text-white transition-transform duration-200 ${isSelected ? 'scale-100' : 'scale-0'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                    </div>
                                </label>
                            )}
                            <button
                                onClick={() => onToggleFavorite(job.id, job.is_favorite || false)}
                                className={`w-7 h-7 flex items-center justify-center rounded-lg transition-all active:scale-90 cursor-pointer text-base
                                    ${job.is_favorite
                                        ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-500 border border-amber-200 dark:border-amber-500/30'
                                        : 'text-slate-300 dark:text-slate-600 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/10 border border-transparent hover:border-amber-200 dark:hover:border-amber-500/30'
                                    }`}
                                title={job.is_favorite ? t('removeFromFavorites') : t('addToFavorites')}
                            >
                                {job.is_favorite ? '⭐' : '☆'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── TAB NAV ── */}
            <div className="flex gap-0 overflow-x-auto scrollbar-none border-b border-slate-100 dark:border-slate-800 mt-3 px-4 sm:px-5">
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as TabType)}
                        className={`
                            px-2.5 sm:px-3 py-2 text-[11px] sm:text-xs font-medium whitespace-nowrap
                            border-b-2 transition-colors cursor-pointer flex-shrink-0
                            ${activeTab === tab.id
                                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                                : 'border-transparent text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
                            }
                        `}
                    >
                        <span className="sm:hidden">{tab.shortLabel}</span>
                        <span className="hidden sm:inline">
                            {tab.labelKey ? (t(tab.labelKey as any) || tab.labelFallback) : tab.labelFallback}
                        </span>
                    </button>
                ))}
            </div>

            {/* ── TAB CONTENT ── */}
            <div className="px-4 sm:px-5 py-4 border-b border-slate-100 dark:border-slate-800/50">
                {activeTab === 'overview' && <JobOverviewTab job={job} onTabChange={setActiveTab} />}
                {activeTab === 'application' && (
                    <JobApplicationTab job={job} isGenerating={isGenerating} onGenerate={onGenerate} onStatusUpdate={onStatusUpdate} onUpdateJob={onUpdateJob} apiBase={apiBase} />
                )}
                {activeTab === 'interview' && <JobInterviewTab job={job} apiBase={apiBase} />}
                {activeTab === 'company' && <JobCompanyTab job={job} apiBase={apiBase} />}
                {activeTab === 'status' && <JobStatusTab job={job} apiBase={apiBase} onStatusUpdate={onStatusUpdate} setActiveTab={setActiveTab} />}
                {activeTab === 'documents' && <JobDocumentsTab job={job} apiBase={apiBase} />}
            </div>

            {/* ── DESCRIPTION TOGGLE ── */}
            {job.description && (
                <details className="group/desc">
                    <summary className="
                        px-4 sm:px-5 py-2.5 text-xs text-slate-400 dark:text-slate-500
                        cursor-pointer select-none list-none
                        flex items-center gap-2
                        hover:text-slate-600 dark:hover:text-slate-300
                        hover:bg-slate-50 dark:hover:bg-slate-800/30
                        transition-colors
                    ">
                        <svg className="w-3 h-3 transition-transform duration-200 group-open/desc:rotate-90 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5l8 7-8 7V5z" />
                        </svg>
                        <span>{t('jobDescription') || 'Stellenbeschreibung'}</span>
                        <span className="flex-1" />
                        {job.url && (
                            <a
                                href={job.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                className="flex items-center gap-1 text-indigo-500 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-semibold transition-colors"
                            >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                                <span className="hidden sm:inline">{t('applySource') || 'Originalanzeige'}</span>
                            </a>
                        )}
                    </summary>
                    <div className="px-4 sm:px-5 pb-4 pt-3 prose prose-sm dark:prose-invert max-w-none text-sm border-t border-slate-100 dark:border-slate-800/50">
                        <ReactMarkdown>{job.description}</ReactMarkdown>
                    </div>
                </details>
            )}
        </div>
    );
}
