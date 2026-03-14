"use client";

import React, { useState } from 'react';
import { useLanguage } from '../../components/LanguageProvider';
import PasswordInput from '../../components/PasswordInput';

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
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/change-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
            });

            if (res.ok) {
                setStatus(t('passwordUpdated'));
                setCurrentPassword('');
                setNewPassword('');
            } else {
                const data = await res.json();
                setStatus(`${t('error')}: ${data.detail || 'Failed'}`);
            }
        } catch (e) {
            setStatus(t('networkError'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleChangePassword} className="space-y-4 w-full">
            <div>
                <PasswordInput
                    placeholder={t('currentPassword')}
                    value={currentPassword}
                    onChange={e => setCurrentPassword(e.target.value)}
                    required
                />
            </div>
            <div>
                <PasswordInput
                    placeholder={t('newPassword')}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    required
                />
            </div>
            <button
                type="submit"
                disabled={loading || !currentPassword || !newPassword}
                className="w-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-4 py-2.5 rounded-xl text-sm font-bold hover:opacity-90 transition disabled:opacity-50"
            >
                {loading ? t('updating') : t('updatePassword')}
            </button>
            {status && <p className={`text-xs mt-2 font-medium ${status.includes('Error') ? 'text-rose-500' : 'text-emerald-500'}`}>{status}</p>}
        </form>
    );
}
