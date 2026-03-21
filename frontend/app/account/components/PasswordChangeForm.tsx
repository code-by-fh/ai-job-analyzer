"use client";

import React, { useState } from 'react';
import { useLanguage } from '../../components/LanguageProvider';
import PasswordInput from '../../components/PasswordInput';
import { fetchWithAuth } from '../../components/AuthProvider';

export default function PasswordChangeForm({ token }: { token: string | null }) {
    const { t } = useLanguage();
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [status, setStatus] = useState('');
    const [loading, setLoading] = useState(false);

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setStatus('');

        try {
            const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/auth/change-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
            });

            if (res.ok) {
                setStatus(t('passwordUpdated'));
                setCurrentPassword('');
                setNewPassword('');
            } else {
                const data = await res.json();
                setStatus(`${t('error')}: ${data.detail || t('failed')}`);
            }
        } catch (e) {
            setStatus(t('networkError'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleChangePassword} className="space-y-4 w-full">
            <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">{t('currentPassword')}</label>
                <PasswordInput
                    placeholder="••••••••"
                    value={currentPassword}
                    onChange={e => setCurrentPassword(e.target.value)}
                    className="font-mono text-sm"
                    required
                />
            </div>
            <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">{t('newPassword')}</label>
                <PasswordInput
                    placeholder="••••••••"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="font-mono text-sm"
                    required
                />
            </div>
            <button
                type="submit"
                disabled={loading || !currentPassword || !newPassword}
                className="w-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-6 py-3.5 rounded-2xl text-sm font-bold shadow-lg shadow-slate-900/10 dark:shadow-white/5 hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-50 disabled:scale-100"
            >
                {loading ? t('updating') : t('updatePassword')}
            </button>
            {status && (
                <p className={`text-xs mt-3 font-medium text-center px-4 py-2 rounded-lg border ${
                    status.includes(t('error')) || status.includes('Error') 
                    ? 'text-rose-600 bg-rose-50 border-rose-100 dark:bg-rose-500/10 dark:border-rose-500/20' 
                    : 'text-emerald-600 bg-emerald-50 border-emerald-100 dark:bg-emerald-500/10 dark:border-emerald-500/20'
                }`}>
                    {status}
                </p>
            )}
        </form>
    );
}
