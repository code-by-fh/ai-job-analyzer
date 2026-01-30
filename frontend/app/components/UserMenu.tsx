"use client";
import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from './AuthProvider';
import { useRouter } from 'next/navigation';

export default function UserMenu() {
    const { user, logout } = useAuth();
    const [open, setOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const router = useRouter();

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    if (!user) return null;

    // Generate Initials/Color
    const initial = user.username.charAt(0).toUpperCase();

    return (
        <div className="relative" ref={menuRef}>
            <button
                onClick={() => setOpen(!open)}
                className="
                    group flex items-center gap-3 w-full
                    p-2 rounded-xl
                    hover:bg-indigo-50 dark:hover:bg-white/5
                    transition-all duration-200
                    cursor-pointer text-left
                "
            >
                {/* Avatar */}
                <div className="relative flex-shrink-0">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-sm shadow-inner ring-2 ring-white dark:ring-slate-800">
                        {initial}
                    </div>
                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-400 border-2 border-white dark:border-slate-900 rounded-full"></div>
                </div>

                {/* User Info */}
                <div className="flex flex-col flex-1 min-w-0">
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">
                        {user.username}
                    </span>
                    <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                        {user.is_admin ? 'Admin' : 'Member'}
                    </span>
                </div>

                {/* Chevron */}
                <span className="text-slate-300 dark:text-slate-600 group-hover:text-indigo-500 transition-colors">⋮</span>
            </button>

            {open && (
                <div className="
                    absolute bottom-full left-0 mb-2 w-56 
                    bg-white dark:bg-slate-900 
                    rounded-xl shadow-xl dark:shadow-none border border-slate-100 dark:border-slate-800 
                    py-1 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200
                    overflow-hidden
                ">
                    <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-white/5">
                        <p className="text-xs text-slate-500 dark:text-slate-400">Angemeldet als</p>
                        <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{user.username}</p>
                    </div>

                    <div className="p-1">
                        <Link
                            href="/settings"
                            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
                            onClick={() => setOpen(false)}
                        >
                            <span>⚙️</span> Einstellungen
                        </Link>

                        {user.is_admin && (
                            <Link
                                href="/admin/users"
                                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
                                onClick={() => setOpen(false)}
                            >
                                <span>🛡️</span> Admin Area
                            </Link>
                        )}
                    </div>

                    <div className="border-t border-slate-100 dark:border-slate-800 mx-1"></div>

                    <div className="p-1">
                        <button
                            onClick={() => {
                                setOpen(false);
                                logout();
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors cursor-pointer"
                        >
                            <span>🚪</span> Abmelden
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
