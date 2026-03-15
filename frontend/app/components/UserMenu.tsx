"use client";
import React from 'react';
import { useAuth } from './AuthProvider';
import { useLanguage } from './LanguageProvider';
import { LogOut } from 'lucide-react';

export default function UserMenu() {
    const { user, logout } = useAuth();
    const { t } = useLanguage();

    if (!user) return null;

    return (
        <button
            onClick={logout}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-xl transition-colors cursor-pointer"
        >
            <LogOut className="w-4 h-4" /> {t('signOut')}
        </button>
    );
}
