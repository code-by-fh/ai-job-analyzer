"use client";
import { useEffect, useState } from 'react';
import { useAuth } from './AuthProvider';
import { useLanguage } from './LanguageProvider';
import JobPlatformsManager from './JobPlatformsManager';
import { logger } from '../lib/logger';

interface Statistics {
    total_jobs: number;
    applied_jobs: number;
    interviews: number;
    offers: number;
    rejected: number;
}

export default function OverviewDashboard() {
    const { token, user, logout } = useAuth();
    const { t } = useLanguage();
    const [stats, setStats] = useState<Statistics | null>(null);
    const [platforms, setPlatforms] = useState<any[]>([]);
    const [configuredAdapters, setConfiguredAdapters] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!token) return;
        Promise.all([
            fetch(`${process.env.NEXT_PUBLIC_API_URL}/statistics`, {
                credentials: 'include',
            }).then(res => {
                if (res.status === 401) { logout(); return null; }
                return res.json();
            }),
            fetch(`${process.env.NEXT_PUBLIC_API_URL}/settings-view`, {
                credentials: 'include',
            }).then(res => {
                if (res.status === 401) return null;
                return res.json();
            }),
        ]).then(([statsData, settingsData]) => {
            if (statsData) setStats(statsData);
            if (settingsData?.platforms) setPlatforms(settingsData.platforms);
            if (settingsData?.profile) {
                const p = settingsData.profile;
                setConfiguredAdapters([
                    ...(p.gmail_address && p.gmail_app_password ? ['GMAIL'] : []),
                    ...(p.pushover_user_key && p.pushover_api_token ? ['PUSHOVER'] : []),
                ]);
            }
            setLoading(false);
        }).catch(err => {
            logger.error({ err }, "OverviewDashboard fetch error");
            setLoading(false);
        });
    }, [token, logout]);

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

            {/* Job Platforms Section */}
            <JobPlatformsManager
                token={token}
                user={user}
                initialPlatforms={platforms}
                configuredAdapters={configuredAdapters}
            />
        </div>
    );
}
