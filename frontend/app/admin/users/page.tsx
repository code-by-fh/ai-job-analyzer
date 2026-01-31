"use client";
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../components/AuthProvider';
import { useLanguage } from '../../components/LanguageProvider';
import { useRouter } from 'next/navigation';

export default function AdminUsersPage() {
    const { user, token, isAuthenticated } = useAuth();
    const { t } = useLanguage();
    const router = useRouter();
    const [users, setUsers] = useState<any[]>([]);

    // Create Form
    const [newUsername, setNewUsername] = useState('');
    const [newPassword, setNewPassword] = useState('');

    useEffect(() => {
        if (!isAuthenticated) return;
        if (user && !user.is_admin) {
            router.push('/');
            return;
        }
        if (token) fetchUsers();
    }, [isAuthenticated, user, token]);

    const fetchUsers = async () => {
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/users`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setUsers(data);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/users`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ username: newUsername, password: newPassword })
            });
            if (res.ok) {
                setNewUsername('');
                setNewPassword('');
                fetchUsers();
            } else {
                alert(t('errorCreatingUser'));
            }
        } catch (e) {
            alert(t('error'));
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm(t('areYouCertain'))) return;
        try {
            await fetch(`${process.env.NEXT_PUBLIC_API_URL}/users/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            fetchUsers();
        } catch (e) { console.error(e); }
    };

    if (!user || !user.is_admin) return <div className="p-8 text-center text-slate-500 animate-pulse">{t('verifyingClearance')}</div>;

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800/50 pb-6">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white">{t('userManagement')}</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">{t('adminControlPanel')}</p>
                </div>
            </div>

            {/* CREATE USER CARD */}
            <div className="bg-white dark:bg-slate-900/40 backdrop-blur-md p-6 rounded-2xl border border-slate-200 dark:border-slate-800">
                <h2 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                    <span>➕</span> {t('createNewUser')}
                </h2>
                <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-4">
                    <input
                        className="flex-1 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-700/50 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                        placeholder={t('username')}
                        value={newUsername} onChange={e => setNewUsername(e.target.value)}
                        required
                    />
                    <input
                        className="flex-1 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-700/50 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                        type="password"
                        placeholder={t('password')}
                        value={newPassword} onChange={e => setNewPassword(e.target.value)}
                        required
                    />
                    <button className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-indigo-500/20 transition active:scale-95 cursor-pointer">
                        {t('createUser')}
                    </button>
                </form>
            </div>

            {/* USER LIST */}
            <div className="bg-white dark:bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-slate-50 dark:bg-slate-950/50 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider font-bold">
                        <tr>
                            <th className="p-5">{t('id')}</th>
                            <th className="p-5">{t('identity')}</th>
                            <th className="p-5">{t('clearance')}</th>
                            <th className="p-5 text-right">{t('actions')}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {users.map(u => (
                            <tr key={u.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition">
                                <td className="p-5 text-slate-400 font-mono text-sm">#{u.id}</td>
                                <td className="p-5 font-bold text-slate-900 dark:text-white">{u.username}</td>
                                <td className="p-5">
                                    {u.is_admin
                                        ? <span className="bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 px-2.5 py-1 rounded-lg text-xs font-bold border border-indigo-200 dark:border-indigo-500/30">ADMIN</span>
                                        : <span className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2.5 py-1 rounded-lg text-xs border border-slate-200 dark:border-slate-700">USER</span>}
                                </td>
                                <td className="p-5 text-right">
                                    {!u.is_admin && (
                                        <button onClick={() => handleDelete(u.id)} className="text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 px-3 py-1.5 rounded-lg text-sm font-medium transition cursor-pointer">
                                            {t('delete')}
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
