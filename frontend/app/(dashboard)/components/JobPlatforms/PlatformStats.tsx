"use client";
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../../components/LanguageProvider';
import { Platform, LastRun } from './types';
import { CrawlSteps, CrawlJob } from '../CrawlStatus';

interface PlatformStatsProps {
    platform: Platform;
    lastRun: LastRun | undefined;
    isBusy: boolean;
    activeJob: CrawlJob | undefined;
    expandedLog: string | null;
    onToggleLog: (url: string) => void;
    onIntervalChange: (id: number, minutes: number) => void;
}

export default function PlatformStats({
    platform,
    lastRun,
    isBusy,
    activeJob,
    expandedLog,
    onToggleLog,
    onIntervalChange,
}: PlatformStatsProps) {
    const { t } = useLanguage();
    const router = useRouter();

    const formatDate = (iso: string) => {
        const date = new Date(iso);
        const d = String(date.getDate()).padStart(2, '0');
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const y = date.getFullYear();
        const h = String(date.getHours()).padStart(2, '0');
        const min = String(date.getMinutes()).padStart(2, '0');
        return `${d}.${m}.${y} ${h}:${min}`;
    };

    return (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            {/* Job count chip */}
            <button
                type="button"
                onClick={() => router.push(`/listings?platform_id=${platform.id}&platform_name=${encodeURIComponent(platform.name)}`)}
                title={t('jobsFound')}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/50 text-slate-600 dark:text-slate-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-200 dark:hover:border-indigo-800/50 transition-all cursor-pointer group/chip"
            >
                <svg className="w-3 h-3 text-indigo-400 group-hover/chip:text-indigo-500 transition-colors shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span className="font-semibold text-slate-700 dark:text-slate-300">{platform.job_count}</span>
                <span className="text-slate-400 hidden sm:inline">{t('jobsFound')}</span>
            </button>

            {/* Last scan chip */}
            <div
                title={t('lastScan')}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/50 text-slate-500 dark:text-slate-400"
            >
                <svg className="w-3 h-3 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{platform.last_crawl_at ? formatDate(platform.last_crawl_at) : t('neverScanned')}</span>
            </div>

            {/* Interval selector chip */}
            <div className="relative flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/50 hover:bg-slate-200 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 transition-all group/select">
                <svg className="w-3 h-3 text-slate-400 group-hover/select:text-indigo-500 transition-colors shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <select
                    value={platform.crawl_interval_minutes}
                    onChange={(e) => onIntervalChange(platform.id, parseInt(e.target.value))}
                    className="appearance-none bg-transparent text-[11px] font-medium text-slate-600 dark:text-slate-300 border-none p-0 pr-4 focus:ring-0 cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors dark:[color-scheme:dark]"
                    title="Scan Interval"
                >
                    <option value={60}  className="bg-white dark:bg-slate-900">{t('everyHour')}</option>
                    <option value={360} className="bg-white dark:bg-slate-900">{t('every6Hours')}</option>
                    <option value={720} className="bg-white dark:bg-slate-900">{t('every12Hours')}</option>
                    <option value={1440} className="bg-white dark:bg-slate-900">{t('every24Hours')}</option>
                    <option value={10080} className="bg-white dark:bg-slate-900">{t('everyWeek')}</option>
                </select>
                <svg className="absolute right-1.5 w-2 h-2 text-slate-400 group-hover/select:text-indigo-500 pointer-events-none transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
                </svg>
            </div>

            {/* Last run result chip */}
            {!isBusy && lastRun && (
                <button
                    type="button"
                    onClick={() => onToggleLog(platform.url)}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-md border transition-all cursor-pointer
                        ${lastRun.status === 'failed'
                            ? 'bg-rose-50 dark:bg-rose-500/10 border-rose-200/60 dark:border-rose-800/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-500/20'
                            : 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200/60 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20'
                        }`}
                >
                    {lastRun.status === 'failed' ? (
                        <>
                            <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                            </svg>
                            <span className="truncate max-w-[100px]">{lastRun.error ?? t('error')}</span>
                        </>
                    ) : (
                        <>
                            <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                            <span>{lastRun.saved} {t('new')}</span>
                            <span className="opacity-30">/</span>
                            <span className="text-slate-400 dark:text-slate-500">{lastRun.total} {t('found')}</span>
                        </>
                    )}
                    <svg className={`w-2.5 h-2.5 opacity-50 transition-transform duration-200 shrink-0 ${expandedLog === platform.url ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                    </svg>
                </button>
            )}

            {/* Expandable log */}
            {!isBusy && lastRun && expandedLog === platform.url && (
                <div className="w-full mt-2 pt-3 border-t border-slate-100 dark:border-slate-800/50 animate-in fade-in slide-in-from-top-1 duration-200">
                    <CrawlSteps compact job={{
                        job_id: platform.url,
                        platform: platform.url,
                        total: lastRun.total,
                        scraping_completed: lastRun.scraping_completed ?? 0,
                        analysis_completed: lastRun.analysis_completed ?? 0,
                        jobs_saved: lastRun.saved,
                        jobs_skipped: lastRun.skipped,
                        status: lastRun.status === 'failed' ? 'failed' : 'completed',
                        error_message: lastRun.error,
                        show_success: lastRun.status === 'success',
                    }} />
                    {lastRun.timestamp && (
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2">{lastRun.timestamp}</p>
                    )}
                </div>
            )}

            {/* Live crawl steps */}
            {isBusy && activeJob && (
                <div className="w-full mt-2 pt-3 border-t border-slate-100 dark:border-slate-800/50">
                    <CrawlSteps compact job={activeJob} />
                </div>
            )}
            {isBusy && !activeJob && (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200/60 dark:border-indigo-800/40 text-indigo-500 dark:text-indigo-400 animate-pulse">
                    <svg className="w-3 h-3 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span>{t('startingCrawler')}</span>
                </div>
            )}
        </div>
    );
}
