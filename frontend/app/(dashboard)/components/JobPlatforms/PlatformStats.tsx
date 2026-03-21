"use client";
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
    onScheduleChange: (id: number, time: string | null, days: number[] | null) => void;
    onOpenNotificationModal: (platform: Platform) => void;
}

const DAY_KEYS = ['dayMon', 'dayTue', 'dayWed', 'dayThu', 'dayFri', 'daySat', 'daySun'] as const;

const ADAPTER_SHORT: Record<string, string> = { PUSHOVER: 'Push', RESEND: 'Resend', MAILJET: 'MJ', SMTP: 'SMTP' };

export default function PlatformStats({
    platform,
    lastRun,
    isBusy,
    activeJob,
    expandedLog,
    onToggleLog,
    onScheduleChange,
    onOpenNotificationModal,
}: PlatformStatsProps) {
    const { t } = useLanguage();
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
    const [localTime, setLocalTime] = useState(platform.schedule_time ?? '08:00');
    const [localDays, setLocalDays] = useState<number[]>(platform.schedule_days ?? [0, 1, 2, 3, 4]);
    const btnRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setLocalTime(platform.schedule_time ?? '08:00');
        setLocalDays(platform.schedule_days ?? [0, 1, 2, 3, 4]);
    }, [platform.schedule_time, platform.schedule_days]);

    useEffect(() => {
        if (!open) return;
        const handleClick = (e: MouseEvent) => {
            if (
                dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
                btnRef.current && !btnRef.current.contains(e.target as Node)
            ) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [open]);

    const handleOpen = () => {
        if (btnRef.current) {
            const rect = btnRef.current.getBoundingClientRect();
            setDropdownPos({ top: rect.bottom + 6, left: rect.left });
        }
        setOpen(o => !o);
    };

    const toggleDay = (day: number) => {
        setLocalDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort());
    };

    const handleSave = () => {
        const hasSchedule = localDays.length > 0;
        onScheduleChange(platform.id, hasSchedule ? localTime : null, hasSchedule ? localDays : null);
        setOpen(false);
    };

    const handleClear = () => {
        onScheduleChange(platform.id, null, null);
        setOpen(false);
    };

    const scheduleLabel = platform.schedule_time && platform.schedule_days?.length
        ? `${platform.schedule_time} · ${platform.schedule_days.map(d => t(DAY_KEYS[d])).join(' ')}`
        : t('noSchedule');

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

            {platform.seen_count > 0 && platform.job_count === 0 && (
                <div
                    title={t('urlsCached')}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-50 dark:bg-amber-500/10 border border-amber-200/70 dark:border-amber-700/50 text-amber-600 dark:text-amber-400"
                >
                    <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                    <span className="font-semibold">{platform.seen_count}</span>
                    <span className="hidden sm:inline">{t('urlsCached')}</span>
                </div>
            )}

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

            {/* Schedule chip */}
            <button
                ref={btnRef}
                type="button"
                onClick={handleOpen}
                title={t('scheduleLabel')}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-md border transition-all cursor-pointer
                    ${platform.schedule_time && platform.schedule_days?.length
                        ? 'bg-indigo-50 dark:bg-indigo-500/10 border-indigo-200/70 dark:border-indigo-700/50 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-500/20'
                        : 'bg-slate-100 dark:bg-slate-800/60 border-slate-200/70 dark:border-slate-700/50 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
                    }`}
            >
                <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="font-medium">{scheduleLabel}</span>
            </button>

            {/* Notification chip */}
            {(() => {
                const active = platform.notification_adapters || [];
                return (
                    <button
                        type="button"
                        onClick={() => onOpenNotificationModal(platform)}
                        title="Benachrichtigungsadapter konfigurieren"
                        className={`flex items-center gap-1.5 px-2 py-1 rounded-md border transition-all cursor-pointer
                            ${active.length > 0
                                ? 'bg-indigo-50 dark:bg-indigo-500/10 border-indigo-200/70 dark:border-indigo-700/50 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-500/20'
                                : 'bg-slate-100 dark:bg-slate-800/60 border-slate-200/70 dark:border-slate-700/50 text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800'
                            }`}
                    >
                        <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                        {active.length > 0 ? (
                            <span className="font-medium">{active.map(a => ADAPTER_SHORT[a] ?? a).join(' · ')}</span>
                        ) : (
                            <span className="font-medium">Off</span>
                        )}
                    </button>
                );
            })()}

            {/* Schedule popover — rendered in portal to escape overflow:hidden */}
            {open && typeof document !== 'undefined' && createPortal(
                <div
                    ref={dropdownRef}
                    style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, zIndex: 9999 }}
                    className="w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl p-3 space-y-3 animate-in fade-in slide-in-from-top-1 duration-150"
                >
                    {/* Time */}
                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('scheduleTime')}</label>
                        <input
                            type="time"
                            value={localTime}
                            onChange={e => setLocalTime(e.target.value)}
                            className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 dark:[color-scheme:dark]"
                        />
                    </div>

                    {/* Weekdays */}
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('scheduleDays')}</label>
                        <div className="flex gap-1">
                            {DAY_KEYS.map((key, i) => (
                                <button
                                    key={i}
                                    type="button"
                                    onClick={() => toggleDay(i)}
                                    className={`flex-1 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer ${localDays.includes(i)
                                            ? 'bg-indigo-600 text-white'
                                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                                        }`}
                                >
                                    {t(key)}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-1">
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={localDays.length === 0}
                            className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-bold rounded-lg transition-all cursor-pointer disabled:cursor-not-allowed"
                        >
                            {t('confirm')}
                        </button>
                        <button
                            type="button"
                            onClick={handleClear}
                            className="px-3 py-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-all cursor-pointer"
                        >
                            {t('remove')}
                        </button>
                    </div>
                </div>,
                document.body
            )}

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
                            <span>{lastRun.total_found ?? lastRun.total} {t('found')}</span>
                            <span className="opacity-30">/</span>
                            <span className="text-slate-400 dark:text-slate-500">{lastRun.saved} {t('new')}</span>
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
