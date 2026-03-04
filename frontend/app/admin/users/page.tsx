"use client";
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../components/AuthProvider';
import { useLanguage } from '../../components/LanguageProvider';
import { useRouter } from 'next/navigation';
import ConfirmModal from '../../components/ConfirmModal';
import { logger } from '../../lib/logger';

export default function UserManagementPage() {
    const { user, token, isAuthenticated } = useAuth();
    const { t } = useLanguage();
    const router = useRouter();
    const [users, setUsers] = useState<any[]>([]);

    // Create Form
    const [newUsername, setNewUsername] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [status, setStatus] = useState('');

    // Confirm Modal
    const [userToDelete, setUserToDelete] = useState<number | null>(null);

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
            logger.error({ err: e }, "Fetch users failed");
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
                setStatus(t('userCreated') || 'User created successfully');
            } else {
                setStatus(t('errorCreatingUser'));
            }
        } catch (e) {
            setStatus(t('error'));
        }
        setTimeout(() => setStatus(''), 3000);
    };

    const handleDelete = (id: number) => {
        setUserToDelete(id);
    };

    const executeDelete = async () => {
        if (!userToDelete) return;
        try {
            await fetch(`${process.env.NEXT_PUBLIC_API_URL}/users/${userToDelete}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            fetchUsers();
        } catch (e) {
            logger.error({ err: e }, "Error deleting user");
            setStatus(t('error') || 'Error deleting user');
            setTimeout(() => setStatus(''), 3000);
        }
        setUserToDelete(null);
    };

    if (!user || !user.is_admin) return <div className="p-8 text-center text-slate-500 animate-pulse">{t('verifyingClearance')}</div>;

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <ConfirmModal
                isOpen={!!userToDelete}
                onClose={() => setUserToDelete(null)}
                onConfirm={executeDelete}
                title={t('deleteUser') || 'Delete User'}
                message={t('areYouCertain')}
                confirmText={t('delete')}
                isDestructive
            />

            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800/50 pb-6">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white">{t('userManagement')}</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">{t('adminControlPanel')}</p>
                </div>
            </div>

            {/* CREATE USER CARD */}
            <div className="bg-white dark:bg-slate-900/50 backdrop-blur-xl p-6 rounded-2xl border border-slate-200/60 dark:border-slate-800/60 shadow-sm hover:shadow-md transition-all duration-300">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <span>➕</span> {t('createNewUser')}
                    </h2>
                    {status && <span className={`text-sm font-bold ${status.includes('error') ? 'text-rose-500' : 'text-emerald-500'}`}>{status}</span>}
                </div>

                <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-4">
                    <input
                        className="flex-1 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-700/50 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                        placeholder={t('username')}
                        value={newUsername} onChange={e => setNewUsername(e.target.value)}
                        required
                        autoComplete="new-username"
                    />
                    <input
                        className="flex-1 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-700/50 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                        type="password"
                        placeholder={t('password')}
                        value={newPassword} onChange={e => setNewPassword(e.target.value)}
                        required
                        autoComplete="new-password"
                    />
                    <button className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-indigo-500/20 transition active:scale-95 cursor-pointer">
                        {t('createUser')}
                    </button>
                </form>
            </div>

            {/* USER LIST */}
            <div className="bg-white dark:bg-slate-900/50 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-800/60 shadow-sm transition-all duration-300 overflow-hidden">
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
