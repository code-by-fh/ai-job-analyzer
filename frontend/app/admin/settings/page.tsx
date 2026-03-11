"use client";
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../components/AuthProvider';
import { useLanguage } from '../../components/LanguageProvider';
import { useRouter } from 'next/navigation';
import PageWrapper from '../../components/PageWrapper';
import PageHeader from '../../components/PageHeader';
import ConfirmModal from '../../components/ConfirmModal';
import { logger } from '../../lib/logger';

export default function AdminSettingsPage() {
    const { user, token, isAuthenticated } = useAuth();
    const { t } = useLanguage();
    const router = useRouter();

    const [model, setModel] = useState('');
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState('');

    // Wipe Database State
    const [showWipeModal, setShowWipeModal] = useState(false);
    const [wipePassword, setWipePassword] = useState('');
    const [wipeAllUsers, setWipeAllUsers] = useState(false);
    const [wipeStatus, setWipeStatus] = useState('');
    const [wipeLoading, setWipeLoading] = useState(false);

    const handleWipeDatabase = async () => {
        if (!wipePassword) {
            setWipeStatus('Passwort erforderlich');
            setShowWipeModal(false);
            return;
        }

        setWipeLoading(true);
        setWipeStatus('Lösche Datenbank...');

        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/database/wipe`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({
                    password: wipePassword,
                    wipe_all_users: wipeAllUsers
                })
            });

            if (res.ok) {
                setWipeStatus('Datenbank erfolgreich zurückgesetzt.');
                try {
                    localStorage.removeItem('crawl_last_run');
                } catch (e) {
                    logger.error('Failed to clear localStorage after wipe');
                }
            } else {
                const data = await res.json();
                setWipeStatus(`Fehler: ${data.detail || 'Konnte Datenbank nicht löschen'}`);
            }
        } catch (e) {
            setWipeStatus('Netzwerkfehler beim Löschen der Datenbank');
        } finally {
            setWipeLoading(false);
            setWipePassword('');
        }

        setTimeout(() => setWipeStatus(''), 5000);
    };

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
                credentials: 'include',
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
                },
                credentials: 'include',
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
        <PageWrapper>
            <PageHeader title="Admin Settings" subtitle="Global System Configuration" />

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

            {/* Danger Zone */}
            <div className="mt-8 bg-white dark:bg-slate-900/40 backdrop-blur-md p-6 rounded-2xl border border-rose-200 dark:border-rose-900">
                <h3 className="text-lg font-bold text-rose-600 dark:text-rose-500 mb-2">Danger Zone</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                    Hier kannst du die komplette Datenbank zurücksetzen. Dabei werden alle Jobs, generierten Bewerbungen,
                    Interview-Materialien, verknüpften Plattformen und Firmenprofile gelöscht.
                    Benutzerkonten und Globale Einstellungen bleiben erhalten.
                </p>
                <div className="flex items-center justify-between">
                    <button
                        type="button"
                        onClick={() => setShowWipeModal(true)}
                        className="bg-rose-600 hover:bg-rose-500 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-rose-500/20 transition active:scale-95 cursor-pointer"
                    >
                        Datenbank löschen...
                    </button>
                    {wipeStatus && (
                        <span className={`text-sm font-bold ${wipeStatus.includes('Error') ? 'text-rose-500' : 'text-emerald-500'}`}>
                            {wipeStatus}
                        </span>
                    )}
                </div>
            </div>

            <ConfirmModal
                isOpen={showWipeModal}
                onClose={() => { setShowWipeModal(false); setWipePassword(''); setWipeStatus(''); }}
                onConfirm={handleWipeDatabase}
                title="Datenbank unwiderruflich löschen"
                message="Bist du sicher, dass du die Datenbank löschen möchtest? Dies kann nicht rückgängig gemacht werden."
                confirmText={wipeLoading ? "Lösche..." : "Dauerhaft löschen"}
                cancelText="Abbrechen"
                isDestructive
            >
                <div className="space-y-4">
                    <div className="flex items-center gap-2 p-3 bg-rose-50 dark:bg-rose-950/30 rounded-xl border border-rose-200 dark:border-rose-900/50">
                        <input
                            type="checkbox"
                            id="wipeAllUsers"
                            checked={wipeAllUsers}
                            onChange={(e) => setWipeAllUsers(e.target.checked)}
                            className="appearance-none w-4 h-4 border border-rose-400 dark:border-rose-600 rounded bg-white dark:bg-slate-900 checked:bg-rose-500 checked:border-rose-500 cursor-pointer relative after:content-['✓'] after:absolute after:text-white after:text-[10px] after:font-bold after:left-1/2 after:top-1/2 after:-translate-x-1/2 after:-translate-y-1/2 after:opacity-0 checked:after:opacity-100 transition-colors shrink-0"
                        />
                        <label htmlFor="wipeAllUsers" className="text-sm text-rose-800 dark:text-rose-400 cursor-pointer leading-tight font-medium">
                            Gesamte Datenbank löschen (Daten von ALLEN Nutzern entfernen)
                        </label>
                    </div>

                    {!wipeAllUsers && (
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            Wenn deaktiviert, werden nur die Jobs, Plattformen und Einträge deines <b>eigenen Admin-Accounts</b> komplett gelöscht.
                        </p>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                            Admin Passwort bestätigen:
                        </label>
                        <input
                            type="password"
                            value={wipePassword}
                            onChange={(e) => setWipePassword(e.target.value)}
                            placeholder="Dein Passwort"
                            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700/50 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500/50"
                        />
                    </div>
                </div>
            </ConfirmModal>

        </PageWrapper>
    );
}
