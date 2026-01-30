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
                    group flex items-center gap-2.5 
                    bg-white/80 backdrop-blur-sm 
                    border border-gray-200/80 hover:border-indigo-300/50
                    rounded-full pl-1 pr-4 py-1.5 
                    transition-all duration-300 ease-out
                    hover:shadow-lg hover:shadow-indigo-500/10 hover:bg-white hover:-translate-y-0.5
                    cursor-pointer
                "
            >
                {/* Avatar */}
                <div className="relative">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-sm shadow-inner ring-2 ring-white group-hover:scale-110 transition-transform duration-300 ease-out">
                        {initial}
                    </div>
                    {/* Online Dot */}
                    <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-400 border-2 border-white rounded-full"></div>
                </div>

                {/* User Info */}
                <div className="flex flex-col items-start text-left">
                    <span className="text-xs font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors duration-200 leading-tight">
                        {user.username}
                    </span>
                    <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide leading-none mt-0.5">
                        {user.is_admin ? 'Admin' : 'Member'}
                    </span>
                </div>

                {/* Chevron */}
                <span className="text-gray-300 text-[10px] group-hover:text-indigo-400 group-hover:rotate-180 transition-all duration-300 ml-1">▼</span>
            </button>

            {open && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="px-4 py-3 border-b border-gray-100">
                        <p className="text-xs text-gray-500">Angemeldet als</p>
                        <p className="text-sm font-bold text-gray-900 truncate">{user.username}</p>
                    </div>

                    <Link
                        href="/settings"
                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                        onClick={() => setOpen(false)}
                    >
                        ⚙️ Einstellungen
                    </Link>

                    {user.is_admin && (
                        <Link
                            href="/admin/users"
                            className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                            onClick={() => setOpen(false)}
                        >
                            🛡️ Admin Dashboard
                        </Link>
                    )}

                    <div className="border-t border-gray-100 my-1"></div>

                    <button
                        onClick={() => {
                            setOpen(false);
                            logout();
                        }}
                        className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                        🚪 Logout
                    </button>
                </div>
            )}
        </div>
    );
}
