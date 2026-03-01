"use client";
import { useState, useEffect } from 'react';
import { useLanguage } from './LanguageProvider';
import ConfirmModal from './ConfirmModal';

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
}

interface JobPlatformsManagerProps {
    token: string | null;
    user: any;
    initialPlatforms?: Platform[];
}

export default function JobPlatformsManager({ token, user, initialPlatforms }: JobPlatformsManagerProps) {
    const { t } = useLanguage();
    const [platforms, setPlatforms] = useState<Platform[]>(initialPlatforms || []);
    const [activeJobs, setActiveJobs] = useState<any[]>([]);
    const [pendingUrls, setPendingUrls] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(!initialPlatforms);
    const [newUrl, setNewUrl] = useState('');
    const [status, setStatus] = useState('');

    // Confirm Modal
    const [platformToRemove, setPlatformToRemove] = useState<number | null>(null);

    const fetchPlatforms = async () => {
        if (!token) return;
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/platforms`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setPlatforms(data);
            }
        } catch (e) {
            console.error("Failed to fetch platforms", e);
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
            }
        } catch (e) {
            console.error("Failed to fetch crawl status", e);
        }
    };

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
            await fetch(`${process.env.NEXT_PUBLIC_API_URL}/platforms/${platformToRemove}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            fetchPlatforms();
        } catch (e) {
            setStatus(`${t('error')} removing platform`);
            setTimeout(() => setStatus(''), 3000);
        }
        setPlatformToRemove(null);
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
                console.error("Update platform failed with status:", res.status);
            }
        } catch (e) {
            console.error("Update platform failed", e);
        }
    };

    const toggleNotification = async (platform: Platform) => {
        const newValue = !platform.is_notification_enabled;
        await updatePlatform(platform.id, { is_notification_enabled: newValue });
    };

    if (loading) return <div className="text-slate-500 text-sm animate-pulse">{t('loading')}</div>;

    return (
        <section id="platforms-manager" className="bg-white dark:bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
            <ConfirmModal
                isOpen={!!platformToRemove}
                onClose={() => setPlatformToRemove(null)}
                onConfirm={finalizeRemovePlatform}
                title={t('removePlatform')}
                message={t('areYouCertain')}
                confirmText={t('remove')}
                isDestructive
            />

            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="font-bold text-slate-900 dark:text-white">{t('jobPlatforms')}</h2>
                    <p className="text-xs text-slate-500 mt-1">{t('platformsSubtitle')}</p>
                </div>
                {status && <span className="text-[10px] font-bold text-indigo-500 animate-pulse">{status}</span>}
            </div>

            <div className="space-y-4">
                {platforms.map((p) => {
                    const isBusy = activeJobs.some(job => job.platform === p.url) || pendingUrls.has(p.url);
                    return (
                        <div key={p.id} className={`group relative border rounded-xl p-4 transition-all hover:shadow-lg hover:shadow-indigo-500/5 ${p.is_active ? 'bg-slate-50 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800/60' : 'bg-slate-100/50 dark:bg-slate-900/20 border-slate-300 dark:border-slate-700/40 opacity-60'}`}>
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex gap-3 items-center min-w-0">
                                    <div className="w-10 h-10 rounded-lg bg-white dark:bg-slate-800 flex items-center justify-center shadow-sm border border-slate-100 dark:border-slate-700 p-1.5 flex-shrink-0">
                                        {p.favicon_url ? (
                                            <img src={p.favicon_url} alt="" className="w-full h-full object-contain" onError={(e) => (e.currentTarget.style.display = 'none')} />
                                        ) : (
                                            <span className="text-lg">🌐</span>
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        {!p.is_active && (
                                            <div className="text-[9px] uppercase font-bold text-rose-500 dark:text-rose-400 mb-0.5 tracking-wider">
                                                {t('deactivated')}
                                            </div>
                                        )}
                                        <div className="font-bold text-slate-900 dark:text-white truncate">{p.name}</div>
                                        <div className="text-[10px] text-slate-400 truncate max-w-[180px]">{p.url}</div>
                                    </div>
                                </div>
                                <div className="flex gap-1">
                                    <button
                                        onClick={() => toggleNotification(p)}
                                        className={`p-2 rounded-lg transition-all cursor-pointer ${p.is_notification_enabled
                                            ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10'
                                            : 'text-slate-400 dark:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800'
                                            }`}
                                        title={p.is_notification_enabled ? t('notificationsEnabled') : t('notificationsDisabled')}
                                    >
                                        <svg className="w-4 h-4" fill={p.is_notification_enabled ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                                    </button>
                                    <button
                                        onClick={() => updatePlatform(p.id, { is_active: !p.is_active })}
                                        className={`p-2 rounded-lg transition-all cursor-pointer ${p.is_active
                                            ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10'
                                            : 'text-slate-400 dark:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800'
                                            }`}
                                        title={p.is_active ? t('platformActive') : t('platformInactive')}
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            {p.is_active ? (
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            ) : (
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            )}
                                        </svg>
                                    </button>
                                    <button
                                        onClick={() => triggerCrawl(p)}
                                        disabled={isBusy || !p.is_active}
                                        className={`p-2 rounded-lg transition ${isBusy || !p.is_active ? 'text-slate-300 dark:text-slate-700 cursor-not-allowed' : 'text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 cursor-pointer'}`}
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
                                    <button
                                        onClick={() => removePlatform(p.id)}
                                        className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition cursor-pointer"
                                        title={t('remove')}
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    </button>
                                </div>
                            </div>

                            <div className="mt-4 grid grid-cols-3 gap-4 pt-3 border-t border-slate-200 dark:border-slate-800/50">
                                <div className="flex flex-col">
                                    <span className="text-[9px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider mb-1">Interval</span>
                                    <select
                                        value={p.crawl_interval_minutes}
                                        onChange={(e) => updatePlatform(p.id, { crawl_interval_minutes: parseInt(e.target.value) })}
                                        className="bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 cursor-pointer"
                                    >
                                        <option value={60} className="bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300">{t('everyHour')}</option>
                                        <option value={360} className="bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300">{t('every6Hours')}</option>
                                        <option value={720} className="bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300">{t('every12Hours')}</option>
                                        <option value={1440} className="bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300">{t('every24Hours')}</option>
                                        <option value={10080} className="bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300">{t('everyWeek')}</option>
                                    </select>
                                </div>

                                <div className="flex flex-col">
                                    <span className="text-[9px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider mb-1">{t('jobsFound')}</span>
                                    <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">{p.job_count}</span>
                                </div>

                                <div className="flex flex-col">
                                    <span className="text-[9px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider mb-1">{t('lastScan')}</span>
                                    <span className="text-xs text-slate-600 dark:text-slate-400">
                                        {p.last_crawl_at ? (() => {
                                            const date = new Date(p.last_crawl_at);
                                            const day = String(date.getDate()).padStart(2, '0');
                                            const month = String(date.getMonth() + 1).padStart(2, '0');
                                            const year = date.getFullYear();
                                            return `${day}.${month}.${year}`;
                                        })() : t('neverScanned')}
                                    </span>
                                </div>
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
