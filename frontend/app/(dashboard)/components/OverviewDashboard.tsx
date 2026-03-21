"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth, fetchWithAuth } from '../../components/AuthProvider';
import { useLanguage } from '../../components/LanguageProvider';
import JobPlatformsManager from './JobPlatformsManager';
import PageWrapper from '../../components/PageWrapper';
import { logger } from '../../lib/logger';

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
    const [profileComplete, setProfileComplete] = useState(true);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!token) return;
        Promise.all([
            fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/statistics`).then(res => {
                if (res.status === 401) { logout(); return null; }
                return res.json();
            }),
            fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/settings-view`).then(res => {
                if (res.status === 401) return null;
                return res.json();
            }),
        ]).then(([statsData, settingsData]) => {
            if (statsData) setStats(statsData);
            if (settingsData?.platforms) setPlatforms(settingsData.platforms);
            if (settingsData?.profile) {
                const p = settingsData.profile;

                // Track configured adapters
                const adapters = [
                    ...(p.pushover_user_key && p.pushover_api_token ? ['PUSHOVER'] : []),
                    ...(p.resend_api_key && p.resend_from_email ? ['RESEND'] : []),
                    ...(p.mailjet_api_key && p.mailjet_secret_key && p.mailjet_from_email ? ['MAILJET'] : []),
                    ...(p.smtp_host && p.smtp_user && p.smtp_password ? ['SMTP'] : []),
                ];
                setConfiguredAdapters(adapters);

                // Simple check for profile completeness: role and skills should not be empty
                // and experience should have at least one entry or some text
                const isComplete = p.role?.trim() !== "" && p.skills?.trim() !== "";
                setProfileComplete(isComplete);
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
            <PageWrapper>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="h-24 rounded-2xl bg-slate-100 dark:bg-slate-800/40 animate-pulse" />
                    ))}
                </div>
                <div className="h-64 rounded-2xl bg-slate-100 dark:bg-slate-800/40 animate-pulse mt-4" />
            </PageWrapper>
        );
    }

    const showProfileWarning = !profileComplete;
    const showNotificationWarning = configuredAdapters.length === 0;
    const hasWarnings = showProfileWarning || showNotificationWarning;

    return (
        <PageWrapper>
            {/* Action Items / Warnings Section */}
            {hasWarnings && (
                <div className="mb-8">
                    <h2 className="text-xs uppercase font-bold text-rose-500 dark:text-rose-400 tracking-widest mb-4 flex items-center gap-2">
                        <span className="flex h-2 w-2 rounded-full bg-rose-500 animate-ping"></span>
                        {t('setupRequired')}
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {showProfileWarning && (
                            <div className="p-5 rounded-2xl border border-rose-200 dark:border-rose-500/30 bg-rose-50/50 dark:bg-rose-500/5 flex items-start gap-4 group transition-all hover:bg-rose-50 dark:hover:bg-rose-500/10">
                                <div className="text-2xl mt-1">👤</div>
                                <div className="flex-1">
                                    <h3 className="font-bold text-slate-800 dark:text-white">{t('profileIncomplete')}</h3>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                        {t('completeProfileDesc')}
                                    </p>
                                    <Link
                                        href="/profile"
                                        className="inline-flex items-center gap-2 mt-4 text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 hover:opacity-80 transition-all"
                                    >
                                        {t('actionCompleteProfile')} →
                                    </Link>
                                </div>
                            </div>
                        )}
                        {showNotificationWarning && (
                            <div className="p-5 rounded-2xl border border-amber-200 dark:border-amber-500/30 bg-amber-50/50 dark:bg-amber-500/5 flex items-start gap-4 group transition-all hover:bg-amber-50 dark:hover:bg-amber-500/10">
                                <div className="text-2xl mt-1">🔔</div>
                                <div className="flex-1">
                                    <h3 className="font-bold text-slate-800 dark:text-white">{t('noNotificationAdapter')}</h3>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                        {t('noNotificationAdapterDesc')}
                                    </p>
                                    <Link
                                        href="/settings"
                                        className="inline-flex items-center gap-2 mt-4 text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 hover:opacity-80 transition-all"
                                    >
                                        {t('actionConfigureNotifications')} →
                                    </Link>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

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
            <div className="mt-8">
                <JobPlatformsManager
                    token={token}
                    user={user}
                    initialPlatforms={platforms}
                    configuredAdapters={configuredAdapters}
                />
            </div>
        </PageWrapper>
    );
}
