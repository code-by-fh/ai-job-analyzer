"use client";
import { useEffect, useState } from 'react';
import { useAuth } from './AuthProvider';
import { useLanguage } from './LanguageProvider';

interface Statistics {
    total_jobs: number;
    applied_jobs: number;
    interviews: number;
    offers: number;
    rejected: number;
}

interface Platform {
    id: number;
    name: string;
    favicon_url: string | null;
    crawl_interval_minutes: number;
    last_crawl_at: string | null;
    is_active: boolean;
    job_count: number;
}

export default function OverviewDashboard() {
    const { token, logout } = useAuth();
    const { t } = useLanguage();
    const [stats, setStats] = useState<Statistics | null>(null);
    const [platforms, setPlatforms] = useState<Platform[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!token) return;
        Promise.all([
            fetch(`${process.env.NEXT_PUBLIC_API_URL}/statistics`, {
                headers: { 'Authorization': `Bearer ${token}` }
            }).then(res => {
                if (res.status === 401) { logout(); return null; }
                return res.json();
            }),
            fetch(`${process.env.NEXT_PUBLIC_API_URL}/platforms`, {
                headers: { 'Authorization': `Bearer ${token}` }
            }).then(res => {
                if (res.status === 401) return null;
                return res.json();
            }),
        ]).then(([statsData, platformsData]) => {
            if (statsData) setStats(statsData);
            if (platformsData) setPlatforms(platformsData);
        }).catch(err => console.error("OverviewDashboard fetch error:", err))
          .finally(() => setLoading(false));
    }, [token, logout]);

    const formatInterval = (minutes: number): string => {
        if (minutes === 60) return t('everyHour');
        if (minutes === 360) return t('every6Hours');
        if (minutes === 720) return t('every12Hours');
        if (minutes === 1440) return t('every24Hours');
        if (minutes === 10080) return t('everyWeek');
        return `${minutes}m`;
    };

    const formatLastScan = (lastCrawlAt: string | null): string => {
        if (!lastCrawlAt) return t('neverScanned');
        const date = new Date(lastCrawlAt);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}.${month}.${year}`;
    };

    const statCards = stats
        ? [
              { label: 'Total', value: stats.total_jobs, color: 'indigo', icon: '💼' },
              { label: t('statusApplied'), value: stats.applied_jobs, color: 'blue', icon: '📤' },
              { label: t('statusInterview'), value: stats.interviews, color: 'amber', icon: '🗓️' },
              { label: t('statusOffer'), value: stats.offers, color: 'emerald', icon: '🎉' },
              { label: t('statusRejected'), value: stats.rejected, color: 'rose', icon: '❌' },
          ]
        : [];

    const colorMap: Record<string, string> = {
        indigo: 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/20',
        blue: 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/20',
        amber: 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/20',
        emerald: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20',
        rose: 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-500/20',
    };

    if (loading) {
        return (
            <div className="space-y-8 animate-in fade-in duration-500">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="h-24 rounded-2xl bg-slate-100 dark:bg-slate-800/40 animate-pulse" />
                    ))}
                </div>
                <div className="h-64 rounded-2xl bg-slate-100 dark:bg-slate-800/40 animate-pulse" />
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Statistics Section */}
            <div>
                <h2 className="text-xs uppercase font-bold text-slate-400 dark:text-slate-500 tracking-widest mb-4">
                    {t('statistics')}
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                    {statCards.map((card) => (
                        <div
                            key={card.label}
                            className={`flex flex-col gap-1 p-5 rounded-2xl border ${colorMap[card.color]}`}
                        >
                            <span className="text-2xl">{card.icon}</span>
                            <span className="text-3xl font-bold mt-1">{card.value}</span>
                            <span className="text-[11px] font-semibold uppercase tracking-wider opacity-70">
                                {card.label}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Scheduled Platforms Section */}
            <div>
                <h2 className="text-xs uppercase font-bold text-slate-400 dark:text-slate-500 tracking-widest mb-4">
                    {t('scheduledPlatforms')}
                </h2>
                <div className="bg-white dark:bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                    {platforms.length === 0 ? (
                        <div className="text-center py-16">
                            <p className="text-slate-400 dark:text-slate-500 text-sm">{t('systemWaiting')}</p>
                        </div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-100 dark:border-slate-800">
                                    <th className="text-left px-6 py-3 text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider">
                                        Platform
                                    </th>
                                    <th className="text-left px-6 py-3 text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider">
                                        Interval
                                    </th>
                                    <th className="text-left px-6 py-3 text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider">
                                        {t('lastScan')}
                                    </th>
                                    <th className="text-left px-6 py-3 text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider">
                                        {t('jobsFound')}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {platforms.map((p) => (
                                    <tr
                                        key={p.id}
                                        className={`transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/30 ${!p.is_active ? 'opacity-50' : ''}`}
                                    >
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-white dark:bg-slate-800 flex items-center justify-center shadow-sm border border-slate-100 dark:border-slate-700 p-1.5 flex-shrink-0">
                                                    {p.favicon_url ? (
                                                        <img
                                                            src={p.favicon_url}
                                                            alt=""
                                                            className="w-full h-full object-contain"
                                                            onError={(e) => (e.currentTarget.style.display = 'none')}
                                                        />
                                                    ) : (
                                                        <span className="text-base">🌐</span>
                                                    )}
                                                </div>
                                                <div>
                                                    <span className="font-semibold text-slate-900 dark:text-white">
                                                        {p.name}
                                                    </span>
                                                    {!p.is_active && (
                                                        <span className="ml-2 text-[9px] uppercase font-bold text-rose-500 dark:text-rose-400">
                                                            {t('deactivated')}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-slate-600 dark:text-slate-400">
                                            {formatInterval(p.crawl_interval_minutes)}
                                        </td>
                                        <td className="px-6 py-4 text-slate-600 dark:text-slate-400">
                                            {formatLastScan(p.last_crawl_at)}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="font-bold text-indigo-600 dark:text-indigo-400">
                                                {p.job_count}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}
