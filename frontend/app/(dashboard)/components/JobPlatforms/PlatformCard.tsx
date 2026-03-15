"use client";
import { useState, useEffect } from 'react';
import { useLanguage } from '../../../components/LanguageProvider';
import { Platform, LastRun } from './types';
import { CrawlJob } from '../CrawlStatus';
import PlatformStats from './PlatformStats';
import NotificationAdapters from './NotificationAdapters';

type TestStatus = 'idle' | 'sending' | 'ok' | 'error';

interface PlatformCardProps {
    platform: Platform;
    isBusy: boolean;
    activeJob: CrawlJob | undefined;
    lastRun: LastRun | undefined;
    expandedLog: string | null;
    configuredAdapters: string[];
    pushoverTestStatus: Record<number, TestStatus>;
    pushoverTestError: Record<number, string | null>;
    isAdmin: boolean;
    onToggleLog: (url: string) => void;
    onScheduleChange: (id: number, time: string | null, days: number[] | null) => void;
    onToggleAdapter: (platform: Platform, adapter: string) => void;
    onOpenTemplateModal: (platform: Platform) => void;
    onOpenPushoverModal: (platform: Platform) => void;
    onSendTestPushover: (platformId: number) => void;
    onTriggerCrawl: (platform: Platform) => void;
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
    configuredAdapters,
    pushoverTestStatus,
    pushoverTestError,
    isAdmin,
    onToggleLog,
    onScheduleChange,
    onToggleAdapter,
    onOpenTemplateModal,
    onOpenPushoverModal,
    onSendTestPushover,
    onTriggerCrawl,
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

    useEffect(() => {
        setEditedUrl(platform.url);
    }, [platform.url]);

    useEffect(() => {
        setEditedName(platform.name);
    }, [platform.name]);

    const handleUrlSubmit = () => {
        if (editedUrl && editedUrl !== platform.url) {
            try {
                const newDomain = new URL(editedUrl).hostname.replace('www.', '');
                const oldDomain = new URL(platform.url).hostname.replace('www.', '');
                if (newDomain !== oldDomain) {
                    setEditedUrl(platform.url);
                    setIsEditingUrl(false);
                    return;
                }
                onUrlChange(platform.id, editedUrl);
            } catch (e) {
                setEditedUrl(platform.url);
            }
        }
        setIsEditingUrl(false);
    };

    const handleNameSubmit = () => {
        if (editedName && editedName !== platform.name) {
            onNameChange(platform.id, editedName);
        }
        setIsEditingName(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent, type: 'url' | 'name') => {
        if (e.key === 'Enter') {
            if (type === 'url') handleUrlSubmit();
            else handleNameSubmit();
        }
        if (e.key === 'Escape') {
            if (type === 'url') {
                setEditedUrl(platform.url);
                setIsEditingUrl(false);
            } else {
                setEditedName(platform.name);
                setIsEditingName(false);
            }
        }
    };

    return (
        <div className={`group relative rounded-2xl border transition-all duration-300 overflow-hidden
            ${platform.is_active
                ? 'bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-800/60 hover:shadow-lg hover:shadow-indigo-500/5'
                : 'bg-slate-50/80 dark:bg-slate-950/30 border-slate-200/60 dark:border-slate-800/40'
            }`}
        >
            {/* Active accent bar */}
            <div className={`absolute left-0 top-0 bottom-0 w-1 transition-all duration-300 rounded-l-2xl
                ${platform.is_active ? 'bg-gradient-to-b from-indigo-400 via-indigo-500 to-violet-500 opacity-0 group-hover:opacity-100' : 'bg-slate-300 dark:bg-slate-700 opacity-50'}`}
            />

            <div className="p-4 sm:p-5">
                {/* Responsive Content Wrapper */}
                <div className="flex flex-col gap-4">

                    {/* Top Row: Logo, Name, Toggle */}
                    <div className="flex items-center gap-3">
                        {/* Favicon */}
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border p-1.5 transition-all duration-300 group-hover:scale-105
                            ${platform.is_active
                                ? 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 shadow-sm'
                                : 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-800 opacity-60'
                            }`}
                        >
                            {platform.favicon_url ? (
                                <img
                                    src={platform.favicon_url}
                                    alt=""
                                    className="w-full h-full object-contain"
                                    onError={(e) => (e.currentTarget.style.display = 'none')}
                                />
                            ) : (
                                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                                </svg>
                            )}
                        </div>

                        {/* Name + URL */}
                        <div className="min-w-0 flex-1">
                            {isEditingName ? (
                                <div className="flex items-center gap-1">
                                    <input
                                        type="text"
                                        value={editedName}
                                        onChange={(e) => setEditedName(e.target.value)}
                                        onKeyDown={(e) => handleKeyDown(e, 'name')}
                                        autoFocus
                                        className="text-sm font-semibold flex-1 bg-slate-50 dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 rounded px-1.5 py-0.5 outline-none text-slate-900 dark:text-white transition-all focus:border-indigo-400 dark:focus:border-indigo-600 focus:ring-1 focus:ring-indigo-400/20"
                                    />
                                    <button
                                        onClick={handleNameSubmit}
                                        className="p-1 text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded transition-colors cursor-pointer"
                                        title={t('confirm') || 'Save'}
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                        </svg>
                                    </button>
                                    <button
                                        onClick={() => {
                                            setEditedName(platform.name);
                                            setIsEditingName(false);
                                        }}
                                        className="p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors cursor-pointer"
                                        title={t('cancel') || 'Cancel'}
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 flex-wrap group/name">
                                    <span className={`font-semibold text-sm leading-tight transition-colors
                                        ${platform.is_active
                                            ? 'text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400'
                                            : 'text-slate-400 dark:text-slate-500'
                                        }`}
                                    >
                                        {platform.name}
                                    </span>
                                    <div className="flex items-center gap-1 opacity-0 group-hover/name:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => setIsEditingName(true)}
                                            className="p-0.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-400 hover:text-indigo-500 transition-colors cursor-pointer"
                                            title={t('edit') || 'Edit'}
                                        >
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                            </svg>
                                        </button>
                                        <button
                                            onClick={() => onGenerateName(platform.id)}
                                            className="p-0.5 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded text-indigo-400 hover:text-indigo-600 transition-colors cursor-pointer"
                                            title="AI Generate Name"
                                        >
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                                            </svg>
                                        </button>
                                    </div>
                                    {!platform.is_active && (
                                        <span className="px-1.5 py-0.5 text-[9px] uppercase font-bold tracking-widest text-slate-400 bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">
                                            {t('deactivated')}
                                        </span>
                                    )}
                                    {isBusy && (
                                        <span className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] uppercase font-bold tracking-widest text-indigo-500 bg-indigo-50 dark:bg-indigo-500/10 rounded border border-indigo-200 dark:border-indigo-800/50">
                                            <svg className="w-2 h-2 animate-spin" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                            </svg>
                                            Scanning
                                        </span>
                                    )}
                                </div>
                            )}
                            {isEditingUrl ? (
                                <div className="flex items-center gap-1 mt-0.5">
                                    <input
                                        type="url"
                                        value={editedUrl}
                                        onChange={(e) => setEditedUrl(e.target.value)}
                                        onKeyDown={(e) => handleKeyDown(e, 'url')}
                                        autoFocus
                                        className="text-[11px] flex-1 bg-slate-50 dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 rounded px-1.5 py-0.5 outline-none text-slate-600 dark:text-slate-300 transition-all focus:border-indigo-400 dark:focus:border-indigo-600 focus:ring-1 focus:ring-indigo-400/20"
                                    />
                                    <button
                                        onClick={handleUrlSubmit}
                                        className="p-1 text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded transition-colors cursor-pointer"
                                        title={t('confirm') || 'Save'}
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                        </svg>
                                    </button>
                                    <button
                                        onClick={() => {
                                            setEditedUrl(platform.url);
                                            setIsEditingUrl(false);
                                        }}
                                        className="p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors cursor-pointer"
                                        title={t('cancel') || 'Cancel'}
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-1.5 mt-0.5 group/url">
                                    <a
                                        href={platform.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-[11px] text-slate-400 hover:text-indigo-500 hover:underline truncate block transition-colors max-w-[calc(100%-20px)]"
                                        title={platform.url}
                                    >
                                        {platform.url}
                                    </a>
                                    <button
                                        onClick={() => setIsEditingUrl(true)}
                                        className="p-0.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-400 hover:text-indigo-500 transition-colors cursor-pointer"
                                        title={t('edit') || 'Edit'}
                                    >
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                        </svg>
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Status Toggle (Main action moved to primary spot on mobile) */}
                        <button
                            onClick={() => onToggleActive(platform.id, !platform.is_active)}
                            title={platform.is_active ? t('platformActive') : t('platformInactive')}
                            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none cursor-pointer
                                ${platform.is_active ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'}`}
                        >
                            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200
                                ${platform.is_active ? 'translate-x-[18px]' : 'translate-x-[3px]'}`}
                            />
                        </button>
                    </div>

                    {/* Bottom Action Row: Adapters, Scan, Delete */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800/50 sm:border-none sm:pt-0 sm:mt-[-4px]">
                        <div className="flex-1 min-w-0">
                            <NotificationAdapters
                                platform={platform}
                                configuredAdapters={configuredAdapters}
                                onToggleAdapter={onToggleAdapter}
                                onOpenTemplateModal={onOpenTemplateModal}
                                onOpenPushoverModal={onOpenPushoverModal}
                                pushoverTestStatus={pushoverTestStatus}
                                pushoverTestError={pushoverTestError}
                                onSendTestPushover={onSendTestPushover}
                                isAdmin={isAdmin}
                            />
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                            {/* Crawl trigger */}
                            <button
                                onClick={() => onTriggerCrawl(platform)}
                                disabled={isBusy || !platform.is_active}
                                title={!platform.is_active ? t('platformInactive') : (isBusy ? t('crawlInProgress') : t('scanNow'))}
                                className={`w-8 h-8 flex items-center justify-center rounded-lg border transition-all
                                    ${isBusy || !platform.is_active
                                        ? 'text-slate-300 dark:text-slate-700 bg-slate-50 dark:bg-slate-900/30 border-slate-100 dark:border-slate-800 cursor-not-allowed'
                                        : 'text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 cursor-pointer shadow-sm'
                                    }`}
                            >
                                {isBusy ? (
                                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                ) : (
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                )}
                            </button>

                            {/* Delete */}
                            <button
                                onClick={() => onRemove(platform.id)}
                                title={t('remove')}
                                className="w-8 h-8 flex items-center justify-center text-slate-300 dark:text-slate-600 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg border border-transparent hover:border-rose-200 dark:hover:border-rose-800/50 transition-all cursor-pointer"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* Stats row */}
                    <div className={`${!platform.is_active ? 'opacity-50' : ''}`}>
                        <PlatformStats
                            platform={platform}
                            lastRun={lastRun}
                            isBusy={isBusy}
                            activeJob={activeJob}
                            expandedLog={expandedLog}
                            onToggleLog={onToggleLog}
                            onScheduleChange={onScheduleChange}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
