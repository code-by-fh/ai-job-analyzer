"use client";
import { useState, useEffect } from 'react';
import { useLanguage } from '../../../components/LanguageProvider';
import { Platform, LastRun } from './types';
import { CrawlJob } from '../CrawlStatus';
import PlatformStats from './PlatformStats';

interface PlatformCardProps {
    platform: Platform;
    isBusy: boolean;
    activeJob: CrawlJob | undefined;
    lastRun: LastRun | undefined;
    expandedLog: string | null;
    onToggleLog: (url: string) => void;
    onScheduleChange: (id: number, time: string | null, days: number[] | null) => void;
    onOpenNotificationModal: (platform: Platform) => void;
    onTriggerCrawl: (platform: Platform) => void;
    onCancelCrawl: (jobId: string) => void;
    onToggleActive: (id: number, isActive: boolean) => void;
    onRemove: (id: number) => void;
    onUrlChange: (id: number, url: string) => void;
    onNameChange: (id: number, name: string) => void;
    onGenerateName: (id: number) => void;
}

export default function PlatformCard({
    platform,
    isBusy,
    activeJob,
    lastRun,
    expandedLog,
    onToggleLog,
    onScheduleChange,
    onOpenNotificationModal,
    onTriggerCrawl,
    onCancelCrawl,
    onToggleActive,
    onRemove,
    onUrlChange,
    onNameChange,
    onGenerateName,
}: PlatformCardProps) {
    const { t } = useLanguage();
    const [isEditingUrl, setIsEditingUrl] = useState(false);
    const [editedUrl, setEditedUrl] = useState(platform.url);
    const [isEditingName, setIsEditingName] = useState(false);
    const [editedName, setEditedName] = useState(platform.name);

    useEffect(() => { setEditedUrl(platform.url); }, [platform.url]);
    useEffect(() => { setEditedName(platform.name); }, [platform.name]);

    const handleUrlSubmit = () => {
        if (editedUrl && editedUrl !== platform.url) {
            try {
                const newDomain = new URL(editedUrl).hostname.replace('www.', '');
                const oldDomain = new URL(platform.url).hostname.replace('www.', '');
                if (newDomain !== oldDomain) { setEditedUrl(platform.url); setIsEditingUrl(false); return; }
                onUrlChange(platform.id, editedUrl);
            } catch { setEditedUrl(platform.url); }
        }
        setIsEditingUrl(false);
    };

    const handleNameSubmit = () => {
        if (editedName && editedName !== platform.name) onNameChange(platform.id, editedName);
        setIsEditingName(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent, type: 'url' | 'name') => {
        if (e.key === 'Enter') { if (type === 'url') handleUrlSubmit(); else handleNameSubmit(); }
        if (e.key === 'Escape') {
            if (type === 'url') { setEditedUrl(platform.url); setIsEditingUrl(false); }
            else { setEditedName(platform.name); setIsEditingName(false); }
        }
    };

    return (
        <div className={`group relative rounded-xl border transition-all duration-200 overflow-hidden
            ${platform.is_active
                ? 'bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-800/60 hover:shadow-md hover:shadow-indigo-500/5'
                : 'bg-slate-50/80 dark:bg-slate-950/30 border-slate-200/60 dark:border-slate-800/40'
            }`}
        >
            <div className={`absolute left-0 top-0 bottom-0 w-0.5 rounded-l-xl transition-all duration-200
                ${platform.is_active ? 'bg-gradient-to-b from-indigo-400 to-violet-500 opacity-0 group-hover:opacity-100' : 'bg-slate-300 dark:bg-slate-700 opacity-40'}`}
            />

            <div className="px-3 py-2.5 flex items-center gap-3">
                {/* Left: Info + Stats */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                        {/* Favicon */}
                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center shrink-0 border p-1.5 transition-all duration-200
                            ${platform.is_active
                                ? 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 shadow-sm'
                                : 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-800 opacity-50'
                            }`}
                        >
                            {platform.favicon_url ? (
                                <img src={platform.favicon_url} alt="" className="w-full h-full object-contain"
                                    onError={(e) => (e.currentTarget.style.display = 'none')} />
                            ) : (
                                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                                </svg>
                            )}
                        </div>

                        {/* Name + URL */}
                        <div className="min-w-0 flex-1">
                            {/* Name row */}
                            {isEditingName ? (
                                <div className="flex items-center gap-1">
                                    <input
                                        type="text" value={editedName}
                                        onChange={(e) => setEditedName(e.target.value)}
                                        onKeyDown={(e) => handleKeyDown(e, 'name')}
                                        autoFocus
                                        className="text-sm font-semibold flex-1 bg-slate-50 dark:bg-slate-900 border border-indigo-300 dark:border-indigo-700 rounded px-1.5 py-0.5 outline-none text-slate-900 dark:text-white"
                                    />
                                    <button onClick={handleNameSubmit} className="p-1.5 sm:p-1 text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded-md cursor-pointer transition-colors active:scale-90">
                                        <svg className="w-4 h-4 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                                    </button>
                                    <button onClick={() => { setEditedName(platform.name); setIsEditingName(false); }} className="p-1.5 sm:p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md cursor-pointer transition-colors active:scale-90">
                                        <svg className="w-4 h-4 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 group/name-row">
                                    <div className={`flex items-center min-w-0 flex-1 gap-2 p-1 -m-1 rounded-lg transition-colors
                                        ${platform.is_active ? 'hover:bg-slate-50 dark:hover:bg-slate-800/50' : ''}`}
                                    >
                                        <span className={`font-semibold text-sm leading-tight transition-colors truncate
                                            ${platform.is_active
                                                ? 'text-slate-900 dark:text-white group-hover/name-row:text-indigo-600 dark:group-hover/name-row:text-indigo-400'
                                                : 'text-slate-400 dark:text-slate-500'
                                            }`}
                                        >
                                            {platform.name}
                                        </span>

                                        <div className="flex items-center ml-auto gap-0.5 bg-slate-100/80 dark:bg-slate-800/80 p-0.5 rounded-md border border-slate-200/50 dark:border-slate-700/50 shrink-0 shadow-sm transition-opacity">
                                            <button
                                                onClick={() => !isBusy && setIsEditingName(true)}
                                                disabled={isBusy}
                                                className="p-1 hover:bg-white dark:hover:bg-slate-700 rounded text-slate-500 dark:text-slate-400 hover:text-indigo-600 transition-all cursor-pointer disabled:hidden active:scale-90"
                                                title={t('edit') || 'Edit'}
                                            >
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                                </svg>
                                            </button>
                                            <div className="w-px h-3 bg-slate-200 dark:bg-slate-700 mx-0.5" />
                                            <button
                                                onClick={() => onGenerateName(platform.id)}
                                                disabled={isBusy}
                                                className="p-1 hover:bg-white dark:hover:bg-slate-700 rounded text-indigo-500 dark:text-indigo-400 hover:text-indigo-600 transition-all cursor-pointer disabled:hidden active:scale-90"
                                                title="AI Generate Name"
                                            >
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.989-2.386l-.548-.547z" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>

                                    {!platform.is_active && (
                                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider shrink-0 shadow-sm transition-all duration-300 group-hover:bg-slate-200/50 dark:group-hover:bg-slate-700/50">
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636" />
                                            </svg>
                                            {t('deactivated')}
                                        </div>
                                    )}
                                    {isBusy && (
                                        <div className="flex items-center gap-1.5 px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 rounded-md border border-indigo-200 dark:border-indigo-800/60 shadow-sm shrink-0 transition-all duration-300">
                                            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                            </svg>
                                            {t('crawlInProgress')}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* URL row */}
                            {isEditingUrl ? (
                                <div className="flex items-center gap-1 mt-0.5">
                                    <input
                                        type="url" value={editedUrl}
                                        onChange={(e) => setEditedUrl(e.target.value)}
                                        onKeyDown={(e) => handleKeyDown(e, 'url')}
                                        autoFocus
                                        className="text-[10px] flex-1 bg-slate-50 dark:bg-slate-900 border border-indigo-300 dark:border-indigo-700 rounded px-1.5 py-px outline-none text-slate-600 dark:text-slate-300"
                                    />
                                    <button onClick={handleUrlSubmit} className="p-1.5 sm:p-1 text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded-md cursor-pointer transition-colors active:scale-90">
                                        <svg className="w-4 h-4 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                                    </button>
                                    <button onClick={() => { setEditedUrl(platform.url); setIsEditingUrl(false); }} className="p-1.5 sm:p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md cursor-pointer transition-colors active:scale-90">
                                        <svg className="w-4 h-4 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                </div>
                            ) : (
                                <div className="mt-1 group/url-row">
                                    <div className={`flex items-center gap-2 p-1 -m-1 rounded-lg transition-colors
                                        ${platform.is_active ? 'hover:bg-slate-50 dark:hover:bg-slate-800/50' : ''}`}
                                    >
                                        <a href={platform.url} target="_blank" rel="noopener noreferrer"
                                            className="text-[10px] text-slate-400 hover:text-indigo-500 hover:underline truncate block transition-colors max-w-[calc(100%-24px)]"
                                            title={platform.url}
                                        >
                                            {platform.url}
                                        </a>
                                        <div className="flex items-center ml-auto bg-slate-100/80 dark:bg-slate-800/80 p-0.5 rounded-md border border-slate-200/50 dark:border-slate-700/50 shrink-0 shadow-sm transition-opacity">
                                            <button
                                                onClick={() => !isBusy && setIsEditingUrl(true)}
                                                disabled={isBusy}
                                                className="p-1 hover:bg-white dark:hover:bg-slate-700 rounded text-slate-500 dark:text-slate-400 hover:text-indigo-500 transition-all cursor-pointer disabled:hidden active:scale-90"
                                                title={t('edit') || 'Edit'}
                                            >
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Stats */}
                    <div className={`mt-2 ${!platform.is_active ? 'opacity-50' : ''}`}>
                        <PlatformStats
                            platform={platform}
                            lastRun={lastRun}
                            isBusy={isBusy}
                            activeJob={activeJob}
                            expandedLog={expandedLog}
                            onToggleLog={onToggleLog}
                            onScheduleChange={onScheduleChange}
                            onOpenNotificationModal={onOpenNotificationModal}
                        />
                    </div>
                </div>

                {/* Right: action buttons + toggle (Stacked vertically) */}
                <div className="flex flex-col items-center gap-2 shrink-0 self-stretch pl-2 sm:pl-3 border-l border-slate-100 dark:border-slate-800/60 transition-all duration-300 ml-1">
                    {/* Cancel crawl */}
                    {activeJob && (
                        <button
                            onClick={() => onCancelCrawl(activeJob.job_id)}
                            title={t('cancelCrawl')}
                            className="w-9 h-9 flex items-center justify-center text-rose-500 bg-rose-50/50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-900/30 hover:bg-rose-100 dark:hover:bg-rose-500/20 rounded-lg transition-all duration-200 shadow-sm hover:shadow-rose-500/10 cursor-pointer active:scale-90"
                        >
                            <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}

                    {/* Scan */}
                    <button
                        onClick={() => onTriggerCrawl(platform)}
                        disabled={isBusy || !platform.is_active}
                        title={!platform.is_active ? t('platformInactive') : (isBusy ? t('crawlInProgress') : t('scanNow'))}
                        className={`w-9 h-9 flex items-center justify-center rounded-lg border transition-all duration-200 shadow-sm active:scale-95
                            ${isBusy || !platform.is_active
                                ? 'text-slate-300 dark:text-slate-700 bg-slate-50 dark:bg-slate-900/30 border-slate-100 dark:border-slate-800/50 cursor-not-allowed'
                                : 'text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700/50 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-500/5 hover:shadow-indigo-500/5 cursor-pointer'
                            }`}
                    >
                        {isBusy ? (
                            <svg className="w-4.5 h-4.5 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                        ) : (
                            <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                        )}
                    </button>

                    {/* Delete */}
                    <button
                        onClick={() => onRemove(platform.id)}
                        disabled={isBusy}
                        title={isBusy ? t('crawlInProgress') : t('remove')}
                        className="w-9 h-9 flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-rose-500 dark:hover:text-rose-400 bg-white dark:bg-slate-800/80 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg border border-slate-200 dark:border-slate-800/50 hover:border-rose-200 dark:hover:border-rose-800/50 transition-all duration-200 cursor-pointer disabled:opacity-30 disabled:pointer-events-none active:scale-90"
                    >
                        <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>

                    {/* Toggle (Moved to bottom of column) */}
                    <div className="flex items-center pt-px mt-0.5">
                        <button
                            onClick={() => !isBusy && onToggleActive(platform.id, !platform.is_active)}
                            disabled={isBusy}
                            title={isBusy ? t('crawlInProgress') : (platform.is_active ? t('platformActive') : t('platformInactive'))}
                            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-all duration-300 focus:outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed
                                ${platform.is_active
                                    ? 'bg-emerald-500 shadow-sm shadow-emerald-500/20'
                                    : 'bg-slate-200 dark:bg-slate-700/50'}`}
                        >
                            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-md transition-all duration-300
                                ${platform.is_active ? 'translate-x-5' : 'translate-x-0.5'}`}
                            />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
