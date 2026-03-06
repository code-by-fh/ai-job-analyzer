"use client";
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from './LanguageProvider';
import ConfirmModal from './ConfirmModal';
import { CrawlSteps } from './CrawlStatus';
import { useCrawl } from '../hooks/useCrawl';
import { logger } from '../lib/logger';

interface Platform {
    id: number;
    url: string;
    name: string;
    favicon_url: string | null;
    crawl_interval_minutes: number;
    last_crawl_at: string | null;
    is_active: boolean;
    job_count: number;
    is_notification_enabled: boolean;
    notification_adapters: string[];
}

interface JobPlatformsManagerProps {
    token: string | null;
    user: any;
    initialPlatforms?: Platform[];
    configuredAdapters?: string[];
}

type LastRun = { total: number; saved: number; skipped: number; scraping_completed?: number; analysis_completed?: number; status: 'success' | 'failed'; error?: string; timestamp?: string };

const sortByName = (list: Platform[]) => [...list].sort((a, b) => a.name.localeCompare(b.name));

export default function JobPlatformsManager({ token, user, initialPlatforms, configuredAdapters = [] }: JobPlatformsManagerProps) {
    const { t } = useLanguage();
    const router = useRouter();
    const [platforms, setPlatforms] = useState<Platform[]>(sortByName(initialPlatforms || []));
    const [pendingUrls, setPendingUrls] = useState<Set<string>>(new Set());
    const [lastRunByPlatform, setLastRunByPlatform] = useState<Record<string, LastRun>>({});
    const [expandedLog, setExpandedLog] = useState<string | null>(null);
    const [loading, setLoading] = useState(!initialPlatforms);
    const [newUrl, setNewUrl] = useState('');
    const [status, setStatus] = useState('');

    // Confirm Modal
    const [platformToRemove, setPlatformToRemove] = useState<number | null>(null);
    const [deleteListingsWithPlatform, setDeleteListingsWithPlatform] = useState(false);
    const [keepFavorites, setKeepFavorites] = useState(true);
    const [keepApplications, setKeepApplications] = useState(true);

    // Centralized crawl state via WebSocket (same as /listings)
    const { activeCrawls } = useCrawl({ user, token });

    // Ref to avoid saving the same completed job twice
    const savedToLastRunRef = useRef<Set<string>>(new Set());

    // Load persisted last-run data on mount
    useEffect(() => {
        try {
            const stored = localStorage.getItem('crawl_last_run');
            if (stored) setLastRunByPlatform(JSON.parse(stored));
        } catch { }
    }, []);

    // Detect completed/failed crawls → save to lastRunByPlatform + refresh platforms
    useEffect(() => {
        activeCrawls.forEach((job) => {
            if ((job.show_success === true || job.status === 'failed') && !savedToLastRunRef.current.has(job.job_id)) {
                savedToLastRunRef.current.add(job.job_id);
                setLastRunByPlatform(prev => {
                    const next: Record<string, LastRun> = {
                        ...prev,
                        [job.platform]: {
                            total: job.total ?? 0,
                            saved: job.jobs_saved ?? 0,
                            skipped: job.jobs_skipped ?? 0,
                            scraping_completed: job.scraping_completed ?? 0,
                            analysis_completed: job.analysis_completed ?? 0,
                            status: job.status === 'failed' ? 'failed' : 'success',
                            error: job.error_message,
                            timestamp: new Date().toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
                        }
                    };
                    try { localStorage.setItem('crawl_last_run', JSON.stringify(next)); } catch { }
                    return next;
                });
                fetchPlatforms();
            }
        });
    }, [activeCrawls]);

    // Clear pendingUrls once the crawl shows up in activeCrawls
    useEffect(() => {
        if (pendingUrls.size === 0) return;
        setPendingUrls(prev => {
            const next = new Set(prev);
            activeCrawls.forEach(job => next.delete(job.platform));
            return next;
        });
    }, [activeCrawls, pendingUrls.size]);

    const fetchPlatforms = async () => {
        if (!token) return;
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/platforms`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setPlatforms(sortByName(data));
            }
        } catch (e) {
            logger.error({ err: e }, "Failed to fetch platforms");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!initialPlatforms) {
            fetchPlatforms();
        }
    }, [token, initialPlatforms]);

    const addPlatform = async () => {
        if (!newUrl) return;
        try {
            const parsed = new URL(newUrl);
            if (!['http:', 'https:'].includes(parsed.protocol)) {
                setStatus(t('invalidUrlProtocol'));
                setTimeout(() => setStatus(''), 3000);
                return;
            }
        } catch (_) {
            setStatus(t('invalidUrl'));
            setTimeout(() => setStatus(''), 3000);
            return;
        }
        setStatus(t('adding'));
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/platforms`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ url: newUrl })
            });
            if (res.ok) {
                setNewUrl('');
                fetchPlatforms();
                setStatus(t('platformAdded'));
            } else {
                const err = await res.json();
                setStatus(`${t('error')}: ${err.detail || 'Failed to add'} ❌`);
            }
        } catch (e) {
            setStatus(t('error'));
        }
        setTimeout(() => setStatus(''), 3000);
    };

    const finalizeRemovePlatform = async () => {
        if (!platformToRemove) return;
        try {
            await fetch(`${process.env.NEXT_PUBLIC_API_URL}/platforms/${platformToRemove}?delete_listings=${deleteListingsWithPlatform}&keep_favorites=${keepFavorites}&keep_applications=${keepApplications}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            fetchPlatforms();
        } catch (e) {
            setStatus(`${t('error')} removing platform`);
            setTimeout(() => setStatus(''), 3000);
        }
        setPlatformToRemove(null);
        setDeleteListingsWithPlatform(false);
        setKeepFavorites(true);
        setKeepApplications(true);
    };

    const triggerCrawl = async (platform: Platform) => {
        setPendingUrls(prev => new Set(prev).add(platform.url));
        setStatus(t('startingCrawler'));
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/platforms/${platform.id}/crawl`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                setStatus(t('crawlJobsDispatched'));
                fetchPlatforms();
            } else {
                setStatus(t('error'));
                setPendingUrls(prev => { const next = new Set(prev); next.delete(platform.url); return next; });
            }
        } catch (e) {
            setStatus(t('error'));
            setPendingUrls(prev => { const next = new Set(prev); next.delete(platform.url); return next; });
        }
        setTimeout(() => setStatus(''), 3000);
    };

    const updatePlatform = async (id: number, data: any) => {
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/platforms/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(data)
            });
            if (res.ok) {
                fetchPlatforms();
            } else {
                logger.error({ status: res.status }, "Update platform failed");
            }
        } catch (e) {
            logger.error({ err: e }, "Update platform failed");
        }
    };

    const toggleAdapter = async (platform: Platform, adapter: string) => {
        const current = platform.notification_adapters || [];
        const updated = current.includes(adapter) ? current.filter((a) => a !== adapter) : [...current, adapter];

        setPlatforms(prev => prev.map(p =>
            p.id === platform.id ? { ...p, notification_adapters: updated, is_notification_enabled: updated.length > 0 } : p
        ));

        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/platforms/${platform.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ notification_adapters: updated })
            });
            if (!res.ok) {
                setPlatforms(prev => prev.map(p =>
                    p.id === platform.id ? { ...p, notification_adapters: current, is_notification_enabled: current.length > 0 } : p
                ));
            }
        } catch {
            setPlatforms(prev => prev.map(p =>
                p.id === platform.id ? { ...p, notification_adapters: current, is_notification_enabled: current.length > 0 } : p
            ));
        }
    };

    if (loading) return <div className="text-slate-500 text-sm animate-pulse">{t('loading')}</div>;

    return (
        <section id="platforms-manager" className="bg-white dark:bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
            <ConfirmModal
                isOpen={!!platformToRemove}
                onClose={() => { setPlatformToRemove(null); setDeleteListingsWithPlatform(false); setKeepFavorites(true); setKeepApplications(true); }}
                onConfirm={finalizeRemovePlatform}
                title={t('removePlatform')}
                message={t('areYouCertain')}
                confirmText={t('remove')}
                isDestructive
            >
                <div className="mt-2 flex flex-col gap-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
                    <div className="flex items-start gap-3">
                        <input
                            type="checkbox"
                            id="deleteListingsCheckbox"
                            checked={deleteListingsWithPlatform}
                            onChange={(e) => setDeleteListingsWithPlatform(e.target.checked)}
                            className="mt-0.5 flex-shrink-0 appearance-none w-4 h-4 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 checked:bg-rose-500 checked:border-rose-500 cursor-pointer relative after:content-['✓'] after:absolute after:text-white after:text-[10px] after:font-bold after:left-1/2 after:top-1/2 after:-translate-x-1/2 after:-translate-y-1/2 after:opacity-0 checked:after:opacity-100 transition-colors"
                        />
                        <label htmlFor="deleteListingsCheckbox" className="text-sm text-slate-700 dark:text-slate-300 cursor-pointer leading-tight font-medium">
                            {t('alsoDeleteListings')}
                        </label>
                    </div>

                    <div className={`flex flex-col gap-1.5 pl-7 mt-1 transition-opacity duration-200 ${deleteListingsWithPlatform ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="keepFavoritesCheckbox"
                                checked={keepFavorites}
                                onChange={(e) => setKeepFavorites(e.target.checked)}
                                className="appearance-none w-3.5 h-3.5 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 checked:bg-indigo-500 checked:border-indigo-500 cursor-pointer relative after:content-['✓'] after:absolute after:text-white after:text-[9px] after:font-bold after:left-1/2 after:top-1/2 after:-translate-x-1/2 after:-translate-y-1/2 after:opacity-0 checked:after:opacity-100 transition-colors"
                            />
                            <label htmlFor="keepFavoritesCheckbox" className="text-xs text-slate-600 dark:text-slate-400 cursor-pointer">{t('keepFavorites')}</label>
                        </div>
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="keepApplicationsCheckbox"
                                checked={keepApplications}
                                onChange={(e) => setKeepApplications(e.target.checked)}
                                className="appearance-none w-3.5 h-3.5 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 checked:bg-indigo-500 checked:border-indigo-500 cursor-pointer relative after:content-['✓'] after:absolute after:text-white after:text-[9px] after:font-bold after:left-1/2 after:top-1/2 after:-translate-x-1/2 after:-translate-y-1/2 after:opacity-0 checked:after:opacity-100 transition-colors"
                            />
                            <label htmlFor="keepApplicationsCheckbox" className="text-xs text-slate-600 dark:text-slate-400 cursor-pointer">{t('keepApplications')}</label>
                        </div>
                    </div>
                </div>
            </ConfirmModal>

            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="font-bold text-slate-900 dark:text-white">{t('jobPlatforms')}</h2>
                    <p className="text-xs text-slate-500 mt-1">{t('platformsSubtitle')}</p>
                </div>
                {status && <span className="text-[10px] font-bold text-indigo-500 animate-pulse">{status}</span>}
            </div>

            <div className="space-y-4">
                {platforms.map((p) => {
                    const activeJob = Array.from(activeCrawls.values()).find(j => j.platform === p.url);
                    const isBusy = !!activeJob || pendingUrls.has(p.url);
                    const lastRun = lastRunByPlatform[p.url];

                    return (
                        <div key={p.id} className={`group relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border rounded-2xl p-4 sm:p-5 transition-all duration-300 hover:shadow-xl hover:shadow-indigo-500/10 ${p.is_active ? 'bg-white/60 dark:bg-slate-900/60 backdrop-blur-md border-slate-200 dark:border-slate-800/80 hover:border-indigo-200 dark:hover:border-indigo-800/60' : 'bg-slate-50/50 dark:bg-slate-950/30 border-slate-200/60 dark:border-slate-800/40 opacity-75'}`}>
                            {/* Left: Branding & Info */}
                            <div className="flex items-start gap-4 min-w-0 flex-1">
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-sm border p-2 transition-transform duration-300 group-hover:scale-105 mt-0.5 ${p.is_active ? 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700' : 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-800 opacity-80'}`}>
                                    {p.favicon_url ? (
                                        <img src={p.favicon_url} alt="" className="w-full h-full object-contain" onError={(e) => (e.currentTarget.style.display = 'none')} />
                                    ) : (
                                        <span className="text-xl">🌐</span>
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <span className={`font-bold text-base truncate transition-colors ${p.is_active ? 'text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}`}>
                                            {p.name}
                                        </span>
                                        {!p.is_active && (
                                            <span className="px-2 py-0.5 text-[9px] uppercase font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 rounded-full border border-slate-200 dark:border-slate-700 tracking-wider">
                                                {t('deactivated')}
                                            </span>
                                        )}
                                    </div>
                                    <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-xs text-slate-500 hover:text-indigo-500 hover:underline truncate block transition-colors" title={p.url}>
                                        {p.url}
                                    </a>

                                    {/* Compact Stats */}
                                    <div className="flex items-center gap-3 mt-2 flex-wrap text-[11px] font-medium text-slate-500 dark:text-slate-400">
                                        <div
                                            className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/50 px-2.5 py-1 rounded-md border border-slate-200/50 dark:border-slate-700/50 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                            title={t('jobsFound')}
                                            onClick={() => router.push(`/listings?platform_id=${p.id}&platform_name=${encodeURIComponent(p.name)}`)}
                                        >
                                            <span className="text-indigo-500">💼</span>
                                            <span className="font-bold text-slate-700 dark:text-slate-300">{p.job_count}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/50 px-2.5 py-1 rounded-md border border-slate-200/50 dark:border-slate-700/50 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors" title={t('lastScan')}>
                                            <span className="text-emerald-500">⏱️</span>
                                            <span>
                                                {p.last_crawl_at ? (() => {
                                                    const date = new Date(p.last_crawl_at);
                                                    const day = String(date.getDate()).padStart(2, '0');
                                                    const month = String(date.getMonth() + 1).padStart(2, '0');
                                                    const year = date.getFullYear();
                                                    const hours = String(date.getHours()).padStart(2, '0');
                                                    const minutes = String(date.getMinutes()).padStart(2, '0');
                                                    return `${day}.${month}.${year} ${hours}:${minutes}`;
                                                })() : t('neverScanned')}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/50 px-2.5 py-1 rounded-md border border-slate-200/50 dark:border-slate-700/50 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors">
                                            <span className="text-blue-500">🔄</span>
                                            <select
                                                value={p.crawl_interval_minutes}
                                                onChange={(e) => updatePlatform(p.id, { crawl_interval_minutes: parseInt(e.target.value) })}
                                                className="bg-transparent text-[11px] font-medium text-slate-700 dark:text-slate-300 border-none p-0 pr-4 focus:ring-0 cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors"
                                                title="Scan Interval"
                                            >
                                                <option value={60}>{t('everyHour')}</option>
                                                <option value={360}>{t('every6Hours')}</option>
                                                <option value={720}>{t('every12Hours')}</option>
                                                <option value={1440}>{t('every24Hours')}</option>
                                                <option value={10080}>{t('everyWeek')}</option>
                                            </select>
                                        </div>
                                    </div>

                                    {/* Last Run Summary (idle only) */}
                                    {!isBusy && lastRun && (
                                        <div className="mt-2 space-y-1.5">
                                            <button
                                                type="button"
                                                onClick={() => setExpandedLog(expandedLog === p.url ? null : p.url)}
                                                className="flex items-center gap-1.5 text-[10px] font-medium cursor-pointer group/log"
                                            >
                                                {lastRun.status === 'failed' ? (
                                                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-800/40 text-rose-600 dark:text-rose-400 group-hover/log:border-rose-400 dark:group-hover/log:border-rose-700 transition-colors">
                                                        <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                                                        {lastRun.error ? lastRun.error.slice(0, 60) : t('error')}
                                                    </span>
                                                ) : (
                                                    <span className="flex items-center gap-2 px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-400 group-hover/log:border-emerald-400 dark:group-hover/log:border-emerald-700 transition-colors">
                                                        <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                                        <span>{lastRun.total} {t('jobsFound')}</span>
                                                        <span className="opacity-40">·</span>
                                                        <span>{lastRun.saved} {t('jobsSaved')}</span>
                                                        {lastRun.skipped > 0 && (
                                                            <>
                                                                <span className="opacity-40">·</span>
                                                                <span>{lastRun.skipped} {t('jobsSkipped')}</span>
                                                            </>
                                                        )}
                                                    </span>
                                                )}
                                                <svg className={`w-3 h-3 text-slate-400 transition-transform duration-200 ${expandedLog === p.url ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
                                            </button>

                                            {/* Expandable Log — reuses CrawlSteps with stored data */}
                                            {expandedLog === p.url && (
                                                <div className="pt-1">
                                                    <CrawlSteps compact job={{
                                                        job_id: p.url,
                                                        platform: p.url,
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
                                        </div>
                                    )}

                                    {/* Live Crawl Steps (active crawl only) */}
                                    {isBusy && activeJob && (
                                        <div className="mt-3">
                                            <CrawlSteps compact job={activeJob} />
                                        </div>
                                    )}
                                    {isBusy && !activeJob && (
                                        <div className="mt-3 flex items-center gap-2 text-xs text-slate-400 animate-pulse">
                                            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                            {t('startingCrawler')}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Right: Actions */}
                            <div className="flex items-center gap-2 w-full sm:w-auto mt-4 sm:mt-0 pt-4 sm:pt-0 border-t sm:border-none border-slate-100 dark:border-slate-800/50 justify-end flex-wrap sm:flex-nowrap">

                                {/* Notification Adapters */}
                                <div className="flex gap-1.5 mr-2">
                                    {(['GMAIL', 'PUSHOVER'] as const).filter(a => configuredAdapters.includes(a)).map((adapter) => {
                                        const active = (p.notification_adapters || []).includes(adapter);
                                        return (
                                            <button
                                                type="button"
                                                key={adapter}
                                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleAdapter(p, adapter); }}
                                                className={`px-2.5 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold tracking-wide transition-all border cursor-pointer flex items-center gap-1.5 ${active
                                                    ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 border-indigo-200 dark:border-indigo-800/50 shadow-sm'
                                                    : 'text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-700 hover:text-slate-600 dark:hover:text-slate-400 line-through opacity-70'
                                                    }`}
                                                title={active ? `Disable ${adapter}` : `Enable ${adapter}`}
                                            >
                                                <span>{adapter === 'GMAIL' ? '✉' : '📱'}</span>
                                                <span className="hidden sm:inline">{adapter}</span>
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Sync Button */}
                                <button
                                    onClick={() => triggerCrawl(p)}
                                    disabled={isBusy || !p.is_active}
                                    className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all ${isBusy || !p.is_active ? 'text-slate-300 dark:text-slate-700 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 cursor-not-allowed' : 'text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm hover:border-indigo-300 dark:hover:border-indigo-600 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer hover:shadow-md'}`}
                                    title={!p.is_active ? t('platformInactive') : (isBusy ? t('crawlInProgress') : t('scanNow'))}
                                >
                                    {isBusy ? (
                                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                    ) : (
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                    )}
                                </button>

                                {/* Active Toggle */}
                                <button
                                    onClick={() => updatePlatform(p.id, { is_active: !p.is_active })}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ml-2 cursor-pointer ${p.is_active ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'}`}
                                    title={p.is_active ? t('platformActive') : t('platformInactive')}
                                >
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${p.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>

                                {/* Delete Button */}
                                <button
                                    onClick={() => removePlatform(p.id)}
                                    className="w-8 h-8 ml-1 flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                                    title={t('remove')}
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                            </div>
                        </div>
                    );
                })}

                <div className="relative flex gap-2 p-2 bg-slate-50/50 dark:bg-slate-950/20 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl mt-4">
                    {!user?.is_profile_complete && (
                        <div className="absolute inset-0 z-10 bg-slate-100/80 dark:bg-slate-900/80 backdrop-blur-sm flex items-center justify-center rounded-xl">
                            <span className="text-xs font-bold text-rose-500 bg-rose-50 dark:bg-rose-950/50 px-3 py-1.5 rounded-full border border-rose-200 dark:border-rose-900 shadow-sm flex items-center gap-1.5">
                                ⚠️ {t('completeProfileFirst')}
                            </span>
                        </div>
                    )}
                    <input
                        value={newUrl}
                        onChange={(e) => setNewUrl(e.target.value)}
                        className="flex-1 bg-transparent border-none text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-0 px-2 disabled:opacity-50"
                        placeholder={t('addPlatformPlaceholder')}
                        onKeyDown={(e) => e.key === 'Enter' && addPlatform()}
                        disabled={!user?.is_profile_complete}
                    />
                    <button
                        onClick={addPlatform}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white w-8 h-8 rounded-lg flex items-center justify-center font-bold transition shadow-lg shadow-indigo-500/20 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={!user?.is_profile_complete}
                    >+</button>
                </div>
            </div>
        </section>
    );

    function removePlatform(id: number) {
        setPlatformToRemove(id);
    }
}
