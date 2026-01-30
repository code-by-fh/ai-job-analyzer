"use client";
import React, { useState } from 'react';

export default function PasswordChangeForm({ token }: { token: string | null }) {
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
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
            });

            if (res.ok) {
                setStatus('Password updated! ✅');
                setCurrentPassword('');
                setNewPassword('');
            } else {
                const data = await res.json();
                setStatus(`Error: ${data.detail || 'Failed'}`);
            }
        } catch (e) {
            setStatus('Network Error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleChangePassword} className="space-y-4 max-w-sm">
            <div>
                <input
                    type="password"
                    placeholder="Current Password"
                    value={currentPassword}
                    onChange={e => setCurrentPassword(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-700/50 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-sm"
                    required
                />
            </div>
            <div>
                <input
                    type="password"
                    placeholder="New Password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-700/50 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-sm"
                    required
                />
            </div>
            <button
                type="submit"
                disabled={loading || !currentPassword || !newPassword}
                className="w-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-4 py-2.5 rounded-xl text-sm font-bold hover:opacity-90 transition disabled:opacity-50"
            >
                {loading ? 'Updating...' : 'Update Password'}
            </button>
            {status && <p className={`text-xs mt-2 font-medium ${status.includes('Error') ? 'text-rose-500' : 'text-emerald-500'}`}>{status}</p>}
        </form>
    );
}
