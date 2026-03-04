"use client";
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../components/AuthProvider';
import { useLanguage } from '../../components/LanguageProvider';
import { useRouter } from 'next/navigation';
import { logger } from '../../lib/logger';

export default function AdminSettingsPage() {
    const { user, token, isAuthenticated } = useAuth();
    const { t } = useLanguage();
    const router = useRouter();

    const [model, setModel] = useState('');
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState('');

    useEffect(() => {
        if (!isAuthenticated) return;
        if (user && !user.is_admin) {
            router.push('/');
            return;
        }
        if (token) fetchSettings();
    }, [isAuthenticated, user, token]);

    const fetchSettings = async () => {
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/settings`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setModel(data.openrouter_model);
            }
        } catch (e) {
            logger.error({ err: e }, "Fetch settings failed");
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatus('Saving...');
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/settings`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ openrouter_model: model })
            });
            if (res.ok) {
                setStatus('Saved successfully!');
            } else {
                setStatus('Error saving settings');
            }
        } catch (e) {
            setStatus('Error saving settings');
        }
        setTimeout(() => setStatus(''), 3000);
    };

    if (!user || !user.is_admin) return <div className="p-8 text-center text-slate-500 animate-pulse">{t('verifyingClearance') || "Verifying..."}</div>;

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800/50 pb-6">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Admin Settings</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Global System Configuration</p>
                </div>
            </div>

            <div className="bg-white dark:bg-slate-900/40 backdrop-blur-md p-6 rounded-2xl border border-slate-200 dark:border-slate-800">
                <form onSubmit={handleSave} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                            OpenRouter Model ID
                        </label>
                        <div className="flex gap-2">
                            <input
                                className="flex-1 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-700/50 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                                value={model}
                                onChange={e => setModel(e.target.value)}
                                placeholder="e.g. tngtech/deepseek-r1t2-chimera:free"
                                required
                            />
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-500 mt-2">
                            Used for all AI operations (Scanning, Analysis, Application generation).
                            Default: <code>tngtech/deepseek-r1t2-chimera:free</code>
                        </p>
                    </div>

                    <div className="flex items-center justify-between pt-4">
                        <button
                            type="submit"
                            className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-indigo-500/20 transition active:scale-95 cursor-pointer"
                        >
                            Save Configuration
                        </button>
                        {status && (
                            <span className={`text-sm font-bold ${status.includes('Error') ? 'text-rose-500' : 'text-emerald-500'}`}>
                                {status}
                            </span>
                        )}
                    </div>
                </form>
            </div>
        </div>
    );
}
