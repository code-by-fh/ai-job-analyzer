"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import UserMenu from './UserMenu';
import ThemeToggler from './ThemeToggler';
import { useAuth, fetchWithAuth } from './AuthProvider';
import { useLanguage } from './LanguageProvider';
import { useNotification } from './NotificationProvider';
import AIErrorBanner from './AIErrorBanner';
import { MAIN_NAV_ITEMS, ADMIN_NAV_ITEMS, NavItemConfig } from '../lib/navigation';
import * as LucideIcons from 'lucide-react';

const DynamicIcon = ({ name, className }: { name: string; className?: string }) => {
    const IconComponent = (LucideIcons as any)[name];
    if (!IconComponent) return null;
    return <IconComponent className={className} />;
};

export default function DashboardShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const isLoginPage = pathname === '/login';
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [moreOpen, setMoreOpen] = useState(false);
    const router = useRouter();
    const { user, isLoading } = useAuth();
    const { t } = useLanguage();
    const { errorDetail, clearError, showError } = useNotification();

    // Restore persisted AI error banner on any page reload
    React.useEffect(() => {
        if (!user) return;
        fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/status`)
            .then(r => r.json())
            .then(data => { if (data.ai_error) showError(data.ai_error); })
            .catch(() => {});
    }, [user]);

    React.useEffect(() => {
        if (!isLoading && !user && !isLoginPage) {
            router.push('/login');
        }
    }, [isLoading, user, isLoginPage, router]);

    // Close "more" panel on navigation
    React.useEffect(() => { setMoreOpen(false); }, [pathname]);

    const isActive = (item: NavItemConfig) => {
        const itemPath = item.href.split('?')[0];
        if (item.matchType === 'startsWith') return pathname.startsWith(itemPath);
        if (pathname !== itemPath) return false;
        if (item.filterParam !== undefined) {
            const currentFilter = searchParams.get('filter');
            if (item.filterParam === null) return currentFilter !== 'applications';
            return currentFilter === item.filterParam;
        }
        return true;
    };

    if (isLoginPage) {
        return (
            <>
                <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300">{children}</div>
                <div className="fixed bottom-4 right-4 z-50"><ThemeToggler /></div>
            </>
        );
    }

    if ((isLoading || !user) && !isLoginPage) {
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
                <div className="w-10 h-10 border-4 border-indigo-200 dark:border-indigo-500/20 border-t-indigo-600 dark:border-t-indigo-500 rounded-full animate-spin" />
            </div>
        );
    }

    const initial = user?.username ? user.username.charAt(0).toUpperCase() : '?';
    const label = (item: NavItemConfig) => item.labelKey ? t(item.labelKey) : (item.labelLiteral || '');
    const hasAdmin = Boolean(user?.is_admin);
    const adminActive = hasAdmin && ADMIN_NAV_ITEMS.some(item => isActive(item));

    return (
        <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300">

            {/* ── DESKTOP SIDEBAR ── */}
            <aside className={`
                hidden md:flex flex-col fixed inset-y-0 left-0 z-50
                bg-white dark:bg-slate-900
                border-r border-slate-200 dark:border-slate-800
                transition-all duration-300 ease-in-out
                ${sidebarCollapsed ? 'w-[68px]' : 'w-56'}
            `}>
                {/* Logo row */}
                <div className={`
                    flex items-center h-14 px-4 border-b border-slate-200 dark:border-slate-800 flex-shrink-0
                    ${sidebarCollapsed ? 'justify-center' : 'justify-between'}
                `}>
                    <div className="flex items-center gap-2.5 min-w-0 overflow-hidden">
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0 shadow-sm">
                            AI
                        </div>
                        {!sidebarCollapsed && (
                            <span className="font-bold text-slate-900 dark:text-white text-sm whitespace-nowrap">
                                Job<span className="text-indigo-600 dark:text-indigo-400">Agent</span>
                            </span>
                        )}
                    </div>
                    {!sidebarCollapsed && (
                        <button
                            onClick={() => setSidebarCollapsed(true)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer flex-shrink-0"
                            title={t('collapseSidebar')}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5" />
                            </svg>
                        </button>
                    )}
                </div>

                {/* Nav items */}
                <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
                    {MAIN_NAV_ITEMS.map(item => (
                        <SidebarLink
                            key={item.href}
                            href={item.href}
                            icon={item.icon}
                            label={label(item)}
                            active={isActive(item)}
                            collapsed={sidebarCollapsed}
                        />
                    ))}
                    {hasAdmin && (
                        <>
                            <div className={`py-3 ${sidebarCollapsed ? '' : 'px-2'}`}>
                                {sidebarCollapsed
                                    ? <div className="h-px bg-slate-200 dark:bg-slate-800" />
                                    : <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-600 uppercase tracking-widest">Admin</p>
                                }
                            </div>
                            {ADMIN_NAV_ITEMS.map(item => (
                                <SidebarLink
                                    key={item.href}
                                    href={item.href}
                                    icon={item.icon}
                                    label={label(item)}
                                    active={isActive(item)}
                                    collapsed={sidebarCollapsed}
                                />
                            ))}
                        </>
                    )}
                </nav>

                {/* Footer */}
                <div className="border-t border-slate-200 dark:border-slate-800 p-2 flex-shrink-0">
                    {sidebarCollapsed ? (
                        <div className="flex flex-col items-center gap-1">
                            <button
                                onClick={() => setSidebarCollapsed(false)}
                                className="w-full flex justify-center p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                title={t('expandSidebar')}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 rotate-180">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5" />
                                </svg>
                            </button>
                            <CollapsedLogout />
                        </div>
                    ) : (
                        <div className="space-y-1">
                            <div className="flex items-center gap-2.5 px-2 py-1.5">
                                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                                    {initial}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate leading-none">{user?.username || 'User'}</p>
                                    <p className="text-[10px] text-slate-400 mt-0.5 leading-none">{user?.is_admin ? t('admin') : t('member')}</p>
                                </div>
                            </div>
                            <UserMenu />
                        </div>
                    )}
                </div>
            </aside>

            {/* ── MOBILE TOP BAR ── */}
            <header className="md:hidden fixed top-0 left-0 right-0 z-50 h-14 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4">
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-xs shadow-sm">
                        AI
                    </div>
                    <span className="font-bold text-slate-900 dark:text-white text-sm">
                        Job<span className="text-indigo-600 dark:text-indigo-400">Agent</span>
                    </span>
                </div>
                {/* User info right side */}
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-xs">
                        {initial}
                    </div>
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{user?.username || 'User'}</span>
                </div>
            </header>

            {/* ── MOBILE "MORE" PANEL (slides up above bottom nav) ── */}
            {moreOpen && (
                <div
                    className="md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
                    onClick={() => setMoreOpen(false)}
                />
            )}
            <div className={`
                md:hidden fixed left-0 right-0 z-50 transition-all duration-300 ease-in-out
                bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800
                rounded-t-2xl shadow-2xl
                ${moreOpen ? 'bottom-16 opacity-100' : 'bottom-16 opacity-0 pointer-events-none translate-y-full'}
            `}>
                <div className="px-4 pt-4 pb-3">
                    {/* Drag handle */}
                    <div className="w-10 h-1 bg-slate-200 dark:bg-slate-700 rounded-full mx-auto mb-4" />

                    {/* Admin items */}
                    {hasAdmin && (
                        <>
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-2 mb-2">Admin</p>
                            <div className="space-y-0.5 mb-4">
                                {ADMIN_NAV_ITEMS.map(item => (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        onClick={() => setMoreOpen(false)}
                                        className={`
                                            flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors
                                            ${isActive(item)
                                                ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300'
                                                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                                            }
                                        `}
                                    >
                                        <DynamicIcon name={item.icon} className="w-5 h-5" />
                                        <span>{label(item)}</span>
                                    </Link>
                                ))}
                            </div>
                            <div className="h-px bg-slate-100 dark:bg-slate-800 mb-4" />
                        </>
                    )}

                    {/* Theme & Language row */}
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-2 mb-3">{t('settings')}</p>
                    <div className="flex items-center justify-between px-2 mb-3">
                        <span className="text-sm font-medium text-slate-600 dark:text-slate-400">{t('switchDark')}</span>
                        <ThemeToggler />
                    </div>
                    <div className="h-px bg-slate-100 dark:bg-slate-800 mb-3" />

                    {/* Logout */}
                    <UserMenu />
                </div>
            </div>

            {/* ── MOBILE BOTTOM NAV ── */}
            <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 h-16 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 flex items-stretch">
                {MAIN_NAV_ITEMS.map(item => {
                    const active = isActive(item);
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`
                                flex-1 flex flex-col items-center justify-center gap-0.5 relative transition-colors duration-200
                                ${active
                                    ? 'text-indigo-600 dark:text-indigo-400'
                                    : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
                                }
                            `}
                        >
                            {active && (
                                <span className="absolute top-0 inset-x-0 flex justify-center">
                                    <span className="w-8 h-0.5 bg-indigo-500 rounded-b-full" />
                                </span>
                            )}
                            <span className={`transition-transform duration-200 ${active ? 'scale-110' : ''}`}>
                                <DynamicIcon name={item.icon} className="w-6 h-6" />
                            </span>
                            <span className="text-[10px] font-medium leading-none">{label(item)}</span>
                        </Link>
                    );
                })}

                {/* More button */}
                <button
                    onClick={() => setMoreOpen(v => !v)}
                    className={`
                        flex-1 flex flex-col items-center justify-center gap-0.5 relative transition-colors duration-200 cursor-pointer
                        ${moreOpen || adminActive
                            ? 'text-indigo-600 dark:text-indigo-400'
                            : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
                        }
                    `}
                >
                    {(moreOpen || adminActive) && (
                        <span className="absolute top-0 inset-x-0 flex justify-center">
                            <span className="w-8 h-0.5 bg-indigo-500 rounded-b-full" />
                        </span>
                    )}
                    <span className={`transition-transform duration-200 ${moreOpen ? 'rotate-90 scale-110' : ''}`}>
                        <LucideIcons.MoreHorizontal className="w-6 h-6" />
                    </span>
                    <span className="text-[10px] font-medium leading-none">{t('more')}</span>
                </button>
            </nav>

            {/* ── MAIN CONTENT ── */}
            <main className={`flex-1 w-full transition-all duration-300 ease-in-out ${sidebarCollapsed ? 'md:pl-[68px]' : 'md:pl-56'}`}>
                <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pt-20 md:pt-8 pb-24 md:pb-8 min-h-screen">
                    {errorDetail && (
                        <div className="mb-6">
                            <AIErrorBanner
                                detail={errorDetail}
                                isAdmin={Boolean(user?.is_admin)}
                                onDismiss={clearError}
                            />
                        </div>
                    )}
                    {children}
                </div>
            </main>

            {/* Toggles – Desktop only */}
            <div className="hidden md:flex fixed bottom-4 right-4 z-50 flex-col gap-3 items-end">
                <ThemeToggler />
            </div>

        </div>
    );
}

function CollapsedLogout() {
    const { logout } = useAuth();
    const { t } = useLanguage();
    return (
        <button
            onClick={logout}
            className="w-full flex justify-center p-2 rounded-lg text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors cursor-pointer"
            title={t('signOut')}
        >
            <LucideIcons.LogOut className="w-5 h-5" />
        </button>
    );
}

function SidebarLink({ href, icon, label, active, collapsed, onClick }: {
    href: string;
    icon: string;
    label: string;
    active: boolean;
    collapsed?: boolean;
    onClick?: () => void;
}) {
    return (
        <Link
            href={href}
            onClick={onClick}
            title={collapsed ? label : undefined}
            className={`
                flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 group relative
                ${collapsed ? 'justify-center px-2' : ''}
                ${active
                    ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200'
                }
            `}
        >
            {active && !collapsed && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-indigo-500 dark:bg-indigo-400 rounded-r-full" />
            )}
            <span className={`flex-shrink-0 transition-transform duration-200 group-hover:scale-110 ${active ? 'scale-110' : ''}`}>
                <DynamicIcon name={icon} className="w-5 h-5" />
            </span>
            {!collapsed && <span className="truncate">{label}</span>}
        </Link>
    );
}
