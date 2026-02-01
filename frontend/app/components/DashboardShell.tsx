"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import UserMenu from './UserMenu';
import ThemeToggler from './ThemeToggler';
import LanguageToggler from './LanguageToggler';
import { useAuth } from './AuthProvider';
import { useLanguage } from './LanguageProvider';
import TutorialModal from './TutorialModal';

export default function DashboardShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const isApplicationsFilter = searchParams.get('filter') === 'applications';
    const isLoginPage = pathname === '/login';
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [showTutorial, setShowTutorial] = useState(false);
    const { user } = useAuth();
    const { t } = useLanguage();

    // Check for first-time user
    React.useEffect(() => {
        const hasSeen = localStorage.getItem('hasSeenTutorial');
        if (!hasSeen && user) {
            setShowTutorial(true);
        }
    }, [user]);

    const handleCloseTutorial = () => {
        localStorage.setItem('hasSeenTutorial', 'true');
        setShowTutorial(false);
    };

    // If it's the login page, render clean layout without dashboard chrome
    if (isLoginPage) {
        return (
            <>
                <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300">{children}</div>
                {/* Language Toggle - Fixed bottom right (stacked) */}
                <div className="fixed bottom-16 right-4 z-50">
                    <LanguageToggler />
                </div>
                {/* Theme Toggle - Fixed bottom right */}
                <div className="fixed bottom-4 right-4 z-50">
                    <ThemeToggler />
                </div>
            </>
        );
    }

    return (
        <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300">

            {/* DESKTOP SIDEBAR */}
            <aside className={`
                hidden md:flex flex-col fixed inset-y-0 left-0 z-50
                bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl
                border-r border-slate-200 dark:border-slate-800
                transition-all duration-300
                ${sidebarCollapsed ? 'w-20' : 'w-64'}
            `}>
                {/* Header with collapse button */}
                <div className="p-6 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/20 flex items-center justify-center text-white font-bold flex-shrink-0">
                        AI
                    </div>
                    {!sidebarCollapsed && (
                        <div className="min-w-0">
                            <h1 className="font-bold text-slate-900 dark:text-white tracking-tight leading-none truncate">Job<span className="text-indigo-600 dark:text-indigo-400">Agent</span></h1>
                            <p className="text-[10px] font-mono text-slate-400 uppercase tracking-widest mt-0.5">{t('deepIntelligence')}</p>
                        </div>
                    )}
                </div>

                <nav id="sidebar-nav" className="flex-1 px-4 py-4 space-y-1">
                    <NavLink href="/" icon="🏠" label={t('dashboard')} active={pathname === '/' && !isApplicationsFilter} collapsed={sidebarCollapsed} />
                    <NavLink href="/?filter=applications" icon="📁" label={t('applications')} active={pathname === '/' && isApplicationsFilter} collapsed={sidebarCollapsed} />
                    <NavLink href="/settings" icon="⚙️" label={t('settings')} active={pathname === '/settings'} collapsed={sidebarCollapsed} />
                    {user?.is_admin && (
                        <>
                            <NavLink href="/admin/users" icon="🛡️" label={t('adminUsers') || "Users"} active={pathname.startsWith('/admin/users')} collapsed={sidebarCollapsed} />
                            <NavLink href="/admin/settings" icon="🔧" label="System Settings" active={pathname.startsWith('/admin/settings')} collapsed={sidebarCollapsed} />
                        </>
                    )}
                </nav>

                <div className="p-4 border-t border-slate-200 dark:border-slate-800">
                    {!sidebarCollapsed ? (
                        <div className="flex items-center gap-2">
                            <div className="flex-1">
                                <UserMenu onShowTutorial={() => setShowTutorial(true)} />
                            </div>
                            <button
                                onClick={() => setSidebarCollapsed(true)}
                                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-900 rounded-lg transition-colors text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 flex-shrink-0 cursor-pointer"
                                title={t('collapseSidebar')}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5" />
                                </svg>
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setSidebarCollapsed(false)}
                            className="w-full p-2 hover:bg-slate-100 dark:hover:bg-slate-900 rounded-lg transition-colors text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                            title={t('expandSidebar')}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 mx-auto rotate-180">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5" />
                            </svg>
                        </button>
                    )}
                </div>
            </aside>

            {/* MOBILE HEADER */}
            <div className="md:hidden fixed top-0 w-full z-50 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-xs">
                        AI
                    </div>
                    <span className="font-bold text-slate-900 dark:text-white">JobAgent</span>
                </div>
                <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 text-slate-600 dark:text-slate-300">
                    {mobileMenuOpen ? '✕' : '☰'}
                </button>
            </div>

            {/* MOBILE MENU OVERLAY */}
            {mobileMenuOpen && (
                <div className="md:hidden fixed inset-0 z-40 bg-slate-50 dark:bg-slate-950 pt-16 px-6 pb-6 animate-in fade-in slide-in-from-top-10 duration-200">
                    <nav className="flex flex-col space-y-4">
                        <NavLink href="/" icon="🏠" label={t('dashboard')} active={pathname === '/' && !isApplicationsFilter} onClick={() => setMobileMenuOpen(false)} />
                        <NavLink href="/?filter=applications" icon="📁" label={t('applications')} active={pathname === '/' && isApplicationsFilter} onClick={() => setMobileMenuOpen(false)} />
                        <NavLink href="/settings" icon="⚙️" label={t('settings')} active={pathname === '/settings'} onClick={() => setMobileMenuOpen(false)} />
                        {user?.is_admin && (
                            <NavLink href="/admin/users" icon="🛡️" label={t('adminUsers')} active={pathname.startsWith('/admin')} onClick={() => setMobileMenuOpen(false)} />
                        )}
                        <div className="pt-8 border-t border-slate-200 dark:border-slate-800 space-y-4">
                            <UserMenu onShowTutorial={() => setShowTutorial(true)} />
                        </div>
                    </nav>
                </div>
            )}

            {/* MAIN CONTENT AREA */}
            <main className={`flex-1 w-full transition-all duration-300 ${sidebarCollapsed ? 'md:pl-20' : 'md:pl-64'}`}>
                <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pt-20 md:pt-8 min-h-screen">
                    {children}
                </div>
            </main>

            {/* Toggles - Fixed bottom right */}
            <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-3 items-end">
                <LanguageToggler />
                <ThemeToggler />
            </div>

            {/* Tutorial Modal */}
            <TutorialModal
                isOpen={showTutorial}
                onClose={handleCloseTutorial}
            />
        </div>
    );
}

function NavLink({ href, icon, label, active, collapsed, onClick }: { href: string, icon: string, label: string, active: boolean, collapsed?: boolean, onClick?: () => void }) {
    return (
        <Link
            href={href}
            onClick={onClick}
            className={`
                flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group
                ${collapsed ? 'justify-center' : ''}
                ${active
                    ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300 shadow-sm dark:shadow-none ring-1 ring-indigo-200 dark:ring-indigo-500/20'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-slate-200'
                }
            `}
            title={collapsed ? label : undefined}
        >
            <span className={`text-lg transition-transform duration-300 group-hover:scale-110 ${active ? 'scale-110' : ''}`}>{icon}</span>
            {!collapsed && (
                <>
                    <span>{label}</span>
                    {active && (
                        <div className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-500 dark:bg-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.6)]"></div>
                    )}
                </>
            )}
        </Link>
    );
}
