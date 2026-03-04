"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, CheckCircle, Circle } from 'lucide-react';
import { useLanguage } from './LanguageProvider';
import ConfirmModal from './ConfirmModal';
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

const sortByName = (list: Platform[]) => [...list].sort((a, b) => a.name.localeCompare(b.name));

export default function JobPlatformsManager({ token, user, initialPlatforms, configuredAdapters = [] }: JobPlatformsManagerProps) {
    const { t } = useLanguage();
    const router = useRouter();
    const [platforms, setPlatforms] = useState<Platform[]>(sortByName(initialPlatforms || []));
    const [activeJobs, setActiveJobs] = useState<any[]>([]);
    const [pendingUrls, setPendingUrls] = useState<Set<string>>(new Set());
    const [lastRunByPlatform, setLastRunByPlatform] = useState<Record<string, { total: number; saved: number; skipped: number; status: 'success' | 'failed'; error?: string }>>({});
    const [loading, setLoading] = useState(!initialPlatforms);
    const [newUrl, setNewUrl] = useState('');
    const [status, setStatus] = useState('');

    // Confirm Modal
    const [platformToRemove, setPlatformToRemove] = useState<number | null>(null);
    const [deleteListingsWithPlatform, setDeleteListingsWithPlatform] = useState(false);
    const [keepFavorites, setKeepFavorites] = useState(true);
    const [keepApplications, setKeepApplications] = useState(true);

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

    const fetchCrawlStatus = async () => {
        if (!user?.id) return;
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_SCRAPER_URL}/crawl-status?user_id=${user.id}`);
            const data = await res.json();
            if (data.jobs) {
                const active = data.jobs.filter((j: any) =>
                    j.status !== 'completed' && !(j.total > 0 && j.analysis_completed >= j.total)
                );
                setActiveJobs(active);

                // Clear pendingUrls that are now active in activeJobs
                setPendingUrls(prev => {
                    const next = new Set(prev);
                    active.forEach((j: any) => next.delete(j.platform));
                    return next;
                });

                // Capture completed/failed jobs as last-run summary
                const done = data.jobs.filter((j: any) =>
                    j.show_success === true || j.status === 'failed' ||
                    (j.total > 0 && j.analysis_completed >= j.total)
                );
                if (done.length > 0) {
                    setLastRunByPlatform(prev => {
                        const next = { ...prev };
                        done.forEach((j: any) => {
                            next[j.platform] = {
                                total: j.total ?? 0,
                                saved: j.jobs_saved ?? 0,
                                skipped: j.jobs_skipped ?? 0,
                                status: j.status === 'failed' ? 'failed' : 'success',
                                error: j.error_message,
                            };
                        });
                        try { localStorage.setItem('crawl_last_run', JSON.stringify(next)); } catch { }
                        return next;
                    });
                }
            }
        } catch (e) {
            logger.error({ err: e }, "Failed to fetch crawl status");
        }
    };

    useEffect(() => {
        try {
            const stored = localStorage.getItem('crawl_last_run');
            if (stored) setLastRunByPlatform(JSON.parse(stored));
        } catch { }
    }, []);

    useEffect(() => {
        if (!initialPlatforms) {
            fetchPlatforms();
        }
    }, [token, initialPlatforms]);

    useEffect(() => {
        if (user?.id) {
            fetchCrawlStatus();
            const interval = setInterval(fetchCrawlStatus, 5000);
            return () => clearInterval(interval);
        }
    }, [user?.id]);

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
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
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

    const removePlatform = (id: number) => {
        setPlatformToRemove(id);
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
                fetchCrawlStatus(); // Try to update faster
                fetchPlatforms();
            } else {
                setStatus(t('error'));
                setPendingUrls(prev => {
                    const next = new Set(prev);
                    next.delete(platform.url);
                    return next;
                });
            }
        } catch (e) {
            setStatus(t('error'));
            setPendingUrls(prev => {
                const next = new Set(prev);
                next.delete(platform.url);
                return next;
            });
        }
        setTimeout(() => setStatus(''), 3000);
    };

    const updatePlatform = async (id: number, data: any) => {
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/platforms/${id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
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
        const updated = current.includes(adapter)
            ? current.filter((a) => a !== adapter)
            : [...current, adapter];

        // Optimistic update — UI reflects the change immediately
        setPlatforms(prev => prev.map(p =>
            p.id === platform.id
                ? { ...p, notification_adapters: updated, is_notification_enabled: updated.length > 0 }
                : p
        ));

        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/platforms/${platform.id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ notification_adapters: updated })
            });
            if (!res.ok) {
                // Revert optimistic update on API error
                setPlatforms(prev => prev.map(p =>
                    p.id === platform.id ? { ...p, notification_adapters: current, is_notification_enabled: current.length > 0 } : p
                ));
            }
        } catch {
            // Revert on network error
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
                            <label htmlFor="keepFavoritesCheckbox" className="text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                                {t('keepFavorites')}
                            </label>
                        </div>
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="keepApplicationsCheckbox"
                                checked={keepApplications}
                                onChange={(e) => setKeepApplications(e.target.checked)}
                                className="appearance-none w-3.5 h-3.5 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 checked:bg-indigo-500 checked:border-indigo-500 cursor-pointer relative after:content-['✓'] after:absolute after:text-white after:text-[9px] after:font-bold after:left-1/2 after:top-1/2 after:-translate-x-1/2 after:-translate-y-1/2 after:opacity-0 checked:after:opacity-100 transition-colors"
                            />
                            <label htmlFor="keepApplicationsCheckbox" className="text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                                {t('keepApplications')}
                            </label>
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
                    const activeJob = activeJobs.find((job: any) => job.platform === p.url);
                    const isBusy = !!activeJob || pendingUrls.has(p.url);

                    const lastRun = lastRunByPlatform[p.url];

                    // Step state derived from activeJob
                    const isFailed = activeJob?.status === 'failed';
                    const isSearching = activeJob && activeJob.total === 0 && !isFailed;
                    const isFound = activeJob && activeJob.total > 0;
                    const isScraping = activeJob && activeJob.scraping_completed > 0 && activeJob.scraping_completed < activeJob.total && !isFailed;
                    const isScrapingDone = activeJob && activeJob.scraping_completed >= activeJob.total && activeJob.total > 0;
                    const isAnalyzing = activeJob && ((activeJob.analyzing_jobs?.length > 0) || (activeJob.analysis_completed > 0 && !activeJob.show_success && !isFailed));
                    const isAnalysisDone = activeJob?.show_success === true;

                    return (
                        <div key={p.id} className={`group relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border rounded-2xl p-4 sm:p-5 transition-all duration-300 hover:shadow-xl hover:shadow-indigo-500/10 ${p.is_active ? 'bg-white/60 dark:bg-slate-900/60 backdrop-blur-md border-slate-200 dark:border-slate-800/80 hover:border-indigo-200 dark:hover:border-indigo-800/60' : 'bg-slate-50/50 dark:bg-slate-950/30 border-slate-200/60 dark:border-slate-800/40 opacity-75'}`}>
                            {/* Left: Branding & Info */}
                            <div className="flex items-center gap-4 min-w-0 flex-1">
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-sm border p-2 transition-transform duration-300 group-hover:scale-105 ${p.is_active ? 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700' : 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-800 opacity-80'}`}>
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

                                    {/* Inline Crawl Status */}
                                    {isBusy && (
                                        <div className="mt-3 flex items-center gap-1.5 text-[10px] font-medium">
                                            {/* Step 1: Suche */}
                                            <div className="flex items-center gap-1">
                                                <span className={`flex items-center justify-center w-4 h-4 rounded-full border ${isSearching ? 'border-indigo-500 bg-white dark:bg-slate-900' : isFailed && !isFound ? 'border-rose-500 bg-rose-500' : 'border-emerald-500 bg-emerald-500'}`}>
                                                    {isSearching
                                                        ? <Loader2 className="w-2.5 h-2.5 text-indigo-500 animate-spin" />
                                                        : isFailed && !isFound
                                                            ? <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                                                            : <CheckCircle className="w-2.5 h-2.5 text-white" />
                                                    }
                                                </span>
                                                <span className={isSearching ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'}>{t('searchingForJobs')}</span>
                                            </div>

                                            <span className="text-slate-300 dark:text-slate-700">›</span>

                                            {/* Step 2: Gefunden */}
                                            <div className="flex items-center gap-1">
                                                <span className={`flex items-center justify-center w-4 h-4 rounded-full border ${!isFound ? 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900' : 'border-emerald-500 bg-emerald-500'}`}>
                                                    {!isFound
                                                        ? <Circle className="w-2.5 h-2.5 text-slate-300 dark:text-slate-600" />
                                                        : <CheckCircle className="w-2.5 h-2.5 text-white" />
                                                    }
                                                </span>
                                                <span className={isFound ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}>
                                                    {isFound ? `${activeJob.total} ${t('jobsFound')}` : t('jobsFound')}
                                                </span>
                                            </div>

                                            <span className="text-slate-300 dark:text-slate-700">›</span>

                                            {/* Step 3: Details */}
                                            <div className="flex items-center gap-1">
                                                <span className={`flex items-center justify-center w-4 h-4 rounded-full border ${!isScraping && !isScrapingDone ? 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900' : isScrapingDone ? 'border-emerald-500 bg-emerald-500' : 'border-indigo-500 bg-white dark:bg-slate-900'}`}>
                                                    {!isScraping && !isScrapingDone
                                                        ? <Circle className="w-2.5 h-2.5 text-slate-300 dark:text-slate-600" />
                                                        : isScrapingDone
                                                            ? <CheckCircle className="w-2.5 h-2.5 text-white" />
                                                            : <Loader2 className="w-2.5 h-2.5 text-indigo-500 animate-spin" />
                                                    }
                                                </span>
                                                <span className={isScraping ? 'text-indigo-600 dark:text-indigo-400' : isScrapingDone ? 'text-slate-400 dark:text-slate-500' : 'text-slate-400 dark:text-slate-500'}>{t('loadJobDetails')}</span>
                                            </div>

                                            <span className="text-slate-300 dark:text-slate-700">›</span>

                                            {/* Step 4: Analyse */}
                                            <div className="flex items-center gap-1">
                                                <span className={`flex items-center justify-center w-4 h-4 rounded-full border ${!isAnalyzing && !isAnalysisDone ? 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900' : isAnalysisDone ? 'border-emerald-500 bg-emerald-500' : 'border-amber-500 bg-white dark:bg-slate-900'}`}>
                                                    {!isAnalyzing && !isAnalysisDone
                                                        ? <Circle className="w-2.5 h-2.5 text-slate-300 dark:text-slate-600" />
                                                        : isAnalysisDone
                                                            ? <CheckCircle className="w-2.5 h-2.5 text-white" />
                                                            : <Loader2 className="w-2.5 h-2.5 text-amber-500 animate-spin" />
                                                    }
                                                </span>
                                                <span className={isAnalyzing && !isAnalysisDone ? 'text-amber-600 dark:text-amber-400' : isAnalysisDone ? 'text-slate-400 dark:text-slate-500' : 'text-slate-400 dark:text-slate-500'}>{t('analysis')}</span>
                                            </div>
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

                                {/* Modern Toggle Switch for Active state */}
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
}
