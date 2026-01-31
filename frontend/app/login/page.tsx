"use client";

import React, { useState } from 'react';
import { useAuth } from '../components/AuthProvider';
import { useLanguage } from '../components/LanguageProvider';

export default function LoginPage() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const { login } = useAuth();
    const { t } = useLanguage();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        const params = new URLSearchParams();
        params.append('username', username);
        params.append('password', password);

        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: params
            });

            if (res.ok) {
                const data = await res.json();
                login(data.access_token);
            } else {
                setError(t('authFailed'));
            }
        } catch (e) {
            setError(t('systemUnreachable'));
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            {/* Background Decoration */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-indigo-500/10 rounded-full blur-[120px] dark:bg-indigo-500/20"></div>
                <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-purple-500/10 rounded-full blur-[120px] dark:bg-purple-500/20"></div>
            </div>

            <div className="
                relative w-full max-w-sm
                bg-white/80 dark:bg-slate-900/60 backdrop-blur-xl
                border border-slate-200 dark:border-slate-800
                shadow-2xl dark:shadow-[0_0_50px_rgba(0,0,0,0.5)]
                rounded-2xl p-8
                animate-in fade-in zoom-in-95 duration-500
            ">
                <div className="flex flex-col items-center mb-8">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-2xl shadow-lg shadow-indigo-500/30 mb-4">
                        AI
                    </div>
                    <h1 className="text-xl font-bold text-slate-900 dark:text-white">Job Agent</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{t('systemAccess')}</p>
                </div>

                {error && (
                    <div className="bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-600 dark:text-rose-400 px-3 py-2 rounded-lg text-sm mb-6 text-center">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5 ml-1">{t('identity')}</label>
                        <input
                            type="text"
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            className="
                                w-full bg-slate-50 dark:bg-slate-950/50 
                                border border-slate-200 dark:border-slate-800 
                                text-slate-900 dark:text-white 
                                rounded-xl px-4 py-2.5 
                                focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 
                                transition-all
                            "
                            placeholder={t('username')}
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5 ml-1">{t('secureKey')}</label>
                        <input
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            className="
                                w-full bg-slate-50 dark:bg-slate-950/50 
                                border border-slate-200 dark:border-slate-800 
                                text-slate-900 dark:text-white 
                                rounded-xl px-4 py-2.5 
                                focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 
                                transition-all
                            "
                            placeholder="••••••••"
                            required
                        />
                    </div>
                    <button
                        type="submit"
                        className="
                            w-full mt-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl 
                            shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/40 
                            transition-all active:scale-95
                        "
                    >
                        {t('initializeSession')}
                    </button>

                    <div className="text-center pt-2">
                        <span className="text-[10px] text-slate-400">{t('defaultCredentials')}</span>
                    </div>
                </form>
            </div>
        </div>
    );
}
