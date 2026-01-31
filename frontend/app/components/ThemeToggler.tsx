"use client";

import { useEffect, useState } from 'react';
import { useLanguage } from './LanguageProvider';

type Theme = 'light' | 'dark';

export default function ThemeToggler() {
    const [isDark, setIsDark] = useState(false);
    const [mounted, setMounted] = useState(false);
    const { t } = useLanguage();

    useEffect(() => {
        setMounted(true);
        const savedTheme = localStorage.getItem('theme') as Theme | null;
        const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

        const initialDark = savedTheme === 'dark' || (!savedTheme && systemPrefersDark);
        setIsDark(initialDark);
        applyTheme(initialDark);
    }, []);

    const applyTheme = (dark: boolean) => {
        const root = document.documentElement;
        if (dark) {
            root.classList.add('dark');
        } else {
            root.classList.remove('dark');
        }
    };

    const toggleTheme = () => {
        const newDark = !isDark;
        setIsDark(newDark);
        localStorage.setItem('theme', newDark ? 'dark' : 'light');
        applyTheme(newDark);
    };

    if (!mounted) return null;

    return (
        <button
            onClick={toggleTheme}
            className="
                relative w-16 h-9 rounded-full p-1 transition-all duration-300 cursor-pointer
                bg-gradient-to-r from-amber-400 to-orange-500 dark:from-indigo-600 dark:to-purple-700
                shadow-lg hover:shadow-xl
                hover:scale-105 active:scale-95
            "
            title={isDark ? t('switchLight') : t('switchDark')}
        >
            {/* Track glow effect */}
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-amber-300/50 to-orange-400/50 dark:from-indigo-500/50 dark:to-purple-600/50 blur-sm"></div>

            {/* Sliding toggle */}
            <div className={`
                relative w-7 h-7 rounded-full transition-all duration-300 ease-out
                bg-white dark:bg-slate-900
                shadow-md
                flex items-center justify-center
                ${isDark ? 'translate-x-7' : 'translate-x-0'}
            `}>
                {/* Sun icon (visible in light mode) */}
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2.5}
                    stroke="currentColor"
                    className={`w-4 h-4 text-amber-500 transition-all duration-300 absolute ${isDark ? 'opacity-0 rotate-90 scale-0' : 'opacity-100 rotate-0 scale-100'}`}
                >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
                </svg>

                {/* Moon icon (visible in dark mode) */}
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2.5}
                    stroke="currentColor"
                    className={`w-4 h-4 text-indigo-400 transition-all duration-300 absolute ${isDark ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-0'}`}
                >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
                </svg>
            </div>
        </button>
    );
}
