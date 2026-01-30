"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import UserMenu from './UserMenu';
import ThemeToggler from './ThemeToggler';
import { useAuth } from './AuthProvider';

export default function DashboardShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isLoginPage = pathname === '/login';
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const { user } = useAuth(); // To check if we should show shell elements

    // If it's the login page, render clean layout without dashboard chrome
    if (isLoginPage) {
        return <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300">{children}</div>;
    }

    return (
        <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300">

            {/* DESKTOP SIDEBAR */}
            <aside className="
                hidden md:flex flex-col w-64 fixed inset-y-0 left-0 z-50
                bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl
                border-r border-slate-200 dark:border-slate-800
                transition-all duration-300
            ">
                <div className="p-6 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/20 flex items-center justify-center text-white font-bold">
                        AI
                    </div>
                    <div>
                        <h1 className="font-bold text-slate-900 dark:text-white tracking-tight leading-none">Job<span className="text-indigo-600 dark:text-indigo-400">Agent</span></h1>
                        <p className="text-[10px] font-mono text-slate-400 uppercase tracking-widest mt-0.5">Deep Intelligence</p>
                    </div>
                </div>

                <nav className="flex-1 px-4 py-4 space-y-1">
                    <NavLink href="/" icon="🏠" label="Dashboard" active={pathname === '/'} />
                    <NavLink href="/settings" icon="⚙️" label="Settings" active={pathname === '/settings'} />
                    {user?.is_admin && (
                        <NavLink href="/admin/users" icon="🛡️" label="Admin Users" active={pathname.startsWith('/admin')} />
                    )}
                </nav>

                <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
                    <ThemeToggler />
                    <UserMenu />
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
                        <NavLink href="/" icon="🏠" label="Dashboard" active={pathname === '/'} onClick={() => setMobileMenuOpen(false)} />
                        <NavLink href="/settings" icon="⚙️" label="Settings" active={pathname === '/settings'} onClick={() => setMobileMenuOpen(false)} />
                        {user?.is_admin && (
                            <NavLink href="/admin/users" icon="🛡️" label="Admin Users" active={pathname.startsWith('/admin')} onClick={() => setMobileMenuOpen(false)} />
                        )}
                        <div className="pt-8 border-t border-slate-200 dark:border-slate-800 space-y-4">
                            <ThemeToggler />
                            <UserMenu />
                        </div>
                    </nav>
                </div>
            )}

            {/* MAIN CONTENT AREA */}
            <main className="flex-1 md:pl-64 w-full transition-all duration-300">
                <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pt-20 md:pt-8 min-h-screen">
                    {children}
                </div>
            </main>
        </div>
    );
}

function NavLink({ href, icon, label, active, onClick }: { href: string, icon: string, label: string, active: boolean, onClick?: () => void }) {
    return (
        <Link
            href={href}
            onClick={onClick}
            className={`
                flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group
                ${active
                    ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300 shadow-sm dark:shadow-none ring-1 ring-indigo-200 dark:ring-indigo-500/20'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-slate-200'
                }
            `}
        >
            <span className={`text-lg transition-transform duration-300 group-hover:scale-110 ${active ? 'scale-110' : ''}`}>{icon}</span>
            <span>{label}</span>
            {active && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-500 dark:bg-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.6)]"></div>
            )}
        </Link>
    );
}
